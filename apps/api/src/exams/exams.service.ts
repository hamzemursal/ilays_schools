import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@school-erp/database";
import { PrismaService } from "../prisma/prisma.service";
import { SchoolsService } from "../schools/schools.service";
import { AuditService } from "../audit/audit.service";
import { AuditAction, AuditModuleName } from "../audit/audit-actions";
import { DocumentsService } from "../documents/documents.service";
import { NotificationsService } from "../notifications/notifications.service";
import type { AuthenticatedUser } from "../auth/types/authenticated-user";
import { CreateExamDto } from "./dto/create-exam.dto";
import { CreateExamSubjectDto } from "./dto/create-exam-subject.dto";
import { UpdateExamSubjectDto } from "./dto/update-exam-subject.dto";
import { UpdateExamTermDto } from "./dto/update-exam-term.dto";
import { EnterMarksDto } from "./dto/enter-marks.dto";
import { ReturnForCorrectionDto } from "./dto/return-for-correction.dto";
import { UnpublishResultsDto } from "./dto/unpublish-results.dto";

export interface ExamPaperListFilters {
  schoolId?: string;
  academicYearId?: string;
  examId?: string;
  classId?: string;
  sectionId?: string;
  subjectId?: string;
  teacherId?: string;
  status?: "DRAFT" | "SUBMITTED";
  dateFrom?: string;
  dateTo?: string;
}

export interface ResultSubmissionListFilters {
  schoolId?: string;
  academicYearId?: string;
  examId?: string;
  classId?: string;
  sectionId?: string;
  subjectId?: string;
  teacherId?: string;
  status?: "DRAFT" | "SUBMITTED" | "NEEDS_CORRECTION" | "APPROVED" | "PUBLISHED";
  dateFrom?: string;
  dateTo?: string;
}

// A single mark, or an explicit absence — never a stored 0 standing in for one.
type MarkValue = number | "ABSENT";

interface MarkChange {
  enrollmentId: string;
  studentId: string;
  studentName: string;
  oldMark: MarkValue | null; // null = nothing was recorded before
  newMark: MarkValue;
}

@Injectable()
export class ExamsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly schools: SchoolsService,
    private readonly audit: AuditService,
    private readonly documents: DocumentsService,
    private readonly notifications: NotificationsService,
  ) {}

  private resultsUrl(schoolId: string, examSubjectId: string, sectionId: string): string {
    return `/schools/${schoolId}/exam-subjects/${examSubjectId}/sections/${sectionId}/results`;
  }

  // The teacher actually responsible for this (section, subject, year) —
  // same lookup already used to resolve the "Teacher" column in the Exam
  // Papers / Results Review lists. Returns null if nobody's currently
  // assigned (a section between teachers), in which case the caller simply
  // has nobody to notify — never an error.
  private async resolveResponsibleTeacherUserId(sectionId: string, subjectId: string, academicYearId: string): Promise<string | null> {
    const assignment = await this.prisma.teacherAssignment.findFirst({
      where: { sectionId, subjectId, academicYearId },
      include: { teacher: true },
    });
    return assignment?.teacher.userId ?? null;
  }

  // A School/Super Admin (no Teacher profile) sees every exam. A Teacher
  // sees only exams that include at least one class+subject they hold a
  // TeacherAssignment for in this school and academic year — narrowed to
  // exactly those examSubjects, not just the exams. Without this, any actor
  // with results.view (which every Teacher has, to view their own marks)
  // could list every class/subject an exam covers school-wide, not just
  // their own — metadata, not marks, but still not this teacher's to see,
  // and the frontend's own client-side filtering was never a substitute
  // for this.
  async listExams(actor: AuthenticatedUser, schoolId: string) {
    // Teacher-aware gate: a teacher assigned at this school (but not a member
    // of it) is admitted, and is then narrowed below to only the class +
    // subject pairs they are assigned to at THIS school.
    await this.schools.findOneAccessibleOrTeachingAtOrThrow(actor, schoolId);

    const exams = await this.prisma.exam.findMany({
      where: { schoolId },
      include: { examSubjects: { include: { class: true, subject: true } }, term: true },
      orderBy: { createdAt: "desc" },
    });

    const teacher = await this.prisma.teacher.findFirst({ where: { userId: actor.id } });
    if (!teacher) return exams;

    const assignments = await this.prisma.teacherAssignment.findMany({
      where: { teacherId: teacher.id, schoolId },
      select: { academicYearId: true, subjectId: true, section: { select: { classId: true } } },
    });
    const allowedKeys = new Set(assignments.map((a) => `${a.academicYearId}|${a.section.classId}|${a.subjectId}`));

    return exams
      .map((exam) => ({
        ...exam,
        examSubjects: exam.examSubjects.filter((es) => allowedKeys.has(`${exam.academicYearId}|${es.classId}|${es.subjectId}`)),
      }))
      .filter((exam) => exam.examSubjects.length > 0);
  }

  async createExam(actor: AuthenticatedUser, schoolId: string, dto: CreateExamDto) {
    await this.schools.findOneAccessibleOrThrow(actor, schoolId);

    const year = await this.prisma.academicYear.findFirst({ where: { id: dto.academicYearId, schoolId } });
    if (!year) throw new BadRequestException("That academic year does not belong to this school");

    const term = await this.prisma.term.findFirst({ where: { id: dto.termId, academicYearId: dto.academicYearId } });
    if (!term) throw new BadRequestException("That term does not belong to the selected academic year");

    // The wizard's bulk step: every pair must be a real ClassSubject
    // relationship, not just a class and a subject that each independently
    // belong to this school — the frontend already scopes its subject list
    // to selected classes this way, but that's a convenience, not a trust
    // boundary. Deduplicated up front so a pair appearing twice (e.g. the
    // same subject shared by two selected classes, submitted once per
    // class by mistake) can't violate ExamSubject's own unique constraint.
    const pairs = dto.examSubjects ?? [];
    const uniquePairs = Array.from(new Map(pairs.map((p) => [`${p.classId}:${p.subjectId}`, p])).values());

    if (uniquePairs.length > 0) {
      const validRelations = await this.prisma.classSubject.findMany({
        where: {
          OR: uniquePairs.map((p) => ({ classId: p.classId, subjectId: p.subjectId })),
          class: { division: { schoolId } },
        },
      });
      const validKeys = new Set(validRelations.map((r) => `${r.classId}:${r.subjectId}`));
      const invalid = uniquePairs.filter((p) => !validKeys.has(`${p.classId}:${p.subjectId}`));
      if (invalid.length > 0) {
        throw new BadRequestException("One or more selected subjects are not assigned to their selected class");
      }
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        const exam = await tx.exam.create({
          data: {
            schoolId,
            academicYearId: dto.academicYearId,
            termId: dto.termId,
            name: dto.name,
            type: dto.type,
            startDate: dto.startDate ? new Date(dto.startDate) : undefined,
            endDate: dto.endDate ? new Date(dto.endDate) : undefined,
            description: dto.description,
          },
        });

        // One batched insert, not one round trip per pair — "Select All"
        // classes and subjects on a school with a large academic structure
        // can easily mean 50-100+ pairs, and a sequential loop of individual
        // creates was measured tripping Prisma's 5s interactive-transaction
        // timeout well before that.
        if (uniquePairs.length > 0) {
          await tx.examSubject.createMany({
            data: uniquePairs.map((pair) => ({
              examId: exam.id,
              classId: pair.classId,
              subjectId: pair.subjectId,
              maxMarks: dto.maxMarks ?? 100,
              passingMark: dto.passingMark,
              examDate: dto.examDate ? new Date(dto.examDate) : undefined,
            })),
            skipDuplicates: true,
          });
        }

        return tx.exam.findUniqueOrThrow({
          where: { id: exam.id },
          include: { examSubjects: { include: { class: true, subject: true } }, term: true },
        });
        // Prisma's interactive-transaction default is 5s — comfortable now
        // that subject creation is one batched insert instead of one round
        // trip per pair, but a wider margin costs nothing against occasional
        // Neon connection latency.
      }, { timeout: 15000 });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictException("An exam with this name already exists for this academic year");
      }
      throw error;
    }
  }

  // Same teacher-narrowing as listExams, for the single-exam view.
  async listExamSubjects(actor: AuthenticatedUser, schoolId: string, examId: string) {
    // Same teacher-aware gate as listExams (the narrowing below is the authorization).
    await this.schools.findOneAccessibleOrTeachingAtOrThrow(actor, schoolId);
    const exam = await this.getExamInSchoolOrThrow(schoolId, examId);
    const examSubjects = await this.prisma.examSubject.findMany({ where: { examId }, include: { class: true, subject: true } });

    const teacher = await this.prisma.teacher.findFirst({ where: { userId: actor.id } });
    if (!teacher) return examSubjects;

    const assignments = await this.prisma.teacherAssignment.findMany({
      where: { teacherId: teacher.id, schoolId, academicYearId: exam.academicYearId },
      select: { subjectId: true, section: { select: { classId: true } } },
    });
    const allowedKeys = new Set(assignments.map((a) => `${a.section.classId}|${a.subjectId}`));

    return examSubjects.filter((es) => allowedKeys.has(`${es.classId}|${es.subjectId}`));
  }

  async createExamSubject(actor: AuthenticatedUser, schoolId: string, examId: string, dto: CreateExamSubjectDto) {
    await this.schools.findOneAccessibleOrThrow(actor, schoolId);
    await this.getExamInSchoolOrThrow(schoolId, examId);

    const cls = await this.prisma.class.findFirst({ where: { id: dto.classId, division: { schoolId } } });
    if (!cls) throw new BadRequestException("That class does not belong to this school");

    const subject = await this.prisma.subject.findFirst({ where: { id: dto.subjectId, schoolId } });
    if (!subject) throw new BadRequestException("That subject does not belong to this school");

    try {
      return await this.prisma.examSubject.create({
        data: {
          examId,
          classId: dto.classId,
          subjectId: dto.subjectId,
          maxMarks: dto.maxMarks ?? 100,
          examDate: dto.examDate ? new Date(dto.examDate) : undefined,
        },
        include: { class: true, subject: true },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictException("This subject is already scheduled for this class in this exam");
      }
      throw error;
    }
  }

  // The "Add subject" form only ever collects class/subject/maxMarks — this
  // is the one way to set or fix examDate afterward (e.g. it was left blank
  // when the subject was scheduled). Deliberately narrow: class, subject,
  // and maxMarks stay fixed once results may already reference this row.
  async updateExamSubject(
    actor: AuthenticatedUser,
    schoolId: string,
    examId: string,
    examSubjectId: string,
    dto: UpdateExamSubjectDto,
  ) {
    await this.schools.findOneAccessibleOrThrow(actor, schoolId);
    await this.getExamInSchoolOrThrow(schoolId, examId);
    const examSubject = await this.prisma.examSubject.findFirst({ where: { id: examSubjectId, examId } });
    if (!examSubject) throw new NotFoundException("Exam subject not found in this exam");

    const updated = await this.prisma.examSubject.update({
      where: { id: examSubjectId },
      data: { examDate: dto.examDate ? new Date(dto.examDate) : undefined },
      include: { class: true, subject: true },
    });

    await this.audit.record({
      actor,
      organizationId: actor.organizationId,
      schoolId,
      action: AuditAction.EXAM_SUBJECT_UPDATED,
      module: AuditModuleName.ACADEMIC,
      resourceType: "ExamSubject",
      resourceId: examSubjectId,
      after: { examDate: dto.examDate ?? null },
    });

    return updated;
  }

  // Re-links an existing exam to one of its own academic year's two terms —
  // the repair path for an exam saved under the wrong term (or, for exams
  // created before Terms existed, under none). Deliberately allowed even
  // when results are already published: that is exactly the situation where
  // a mislinked exam is hiding a whole term from the Annual Result. The
  // change is audited with both the old and new term.
  async updateExamTerm(actor: AuthenticatedUser, schoolId: string, examId: string, dto: UpdateExamTermDto) {
    await this.schools.findOneAccessibleOrThrow(actor, schoolId);

    const exam = await this.prisma.exam.findFirst({ where: { id: examId, schoolId }, include: { term: true } });
    if (!exam) throw new NotFoundException("Exam not found in this school");

    const term = await this.prisma.term.findFirst({ where: { id: dto.termId, academicYearId: exam.academicYearId } });
    if (!term) throw new BadRequestException("That term does not belong to this exam's academic year");

    if (exam.termId === term.id) return exam;

    const updated = await this.prisma.exam.update({
      where: { id: examId },
      data: { termId: term.id },
      include: { term: true },
    });

    await this.audit.record({
      actor,
      organizationId: actor.organizationId,
      schoolId,
      action: AuditAction.EXAM_TERM_CHANGED,
      module: AuditModuleName.ACADEMIC,
      resourceType: "Exam",
      resourceId: examId,
      resourceName: exam.name,
      severity: "WARNING",
      before: { termId: exam.termId, termName: exam.term?.name ?? null },
      after: { termId: term.id, termName: term.name },
    });

    return updated;
  }

  async getResultsForSection(actor: AuthenticatedUser, schoolId: string, examSubjectId: string, sectionId: string) {
    const examSubject = await this.getExamSubjectInSchoolOrThrow(schoolId, examSubjectId);
    await this.assertCanAccessSectionForSubject(actor, schoolId, sectionId, examSubject.subjectId, examSubject.exam.academicYearId);
    await this.assertSectionBelongsToClass(sectionId, examSubject.classId);

    // The exam's own academicYearId already pins this to one specific year —
    // status: "ACTIVE" would additionally require that year's enrollment to
    // still be open, which is false for any exam from a year the student has
    // since moved on from (promoted/retained/etc.), producing an empty
    // roster and an impossible "0/0" for an otherwise-real historical exam.
    const enrollments = await this.prisma.studentEnrollment.findMany({
      where: { sectionId, academicYearId: examSubject.exam.academicYearId },
      include: { student: true, results: { where: { examSubjectId } } },
      orderBy: { rollNumber: "asc" },
    });

    const submission = await this.prisma.resultSubmission.findUnique({
      where: { examSubjectId_sectionId: { examSubjectId, sectionId } },
    });

    const [section, assignment, schoolLogoUrl] = await Promise.all([
      this.prisma.section.findUnique({ where: { id: sectionId } }),
      this.prisma.teacherAssignment.findFirst({
        where: { sectionId, subjectId: examSubject.subjectId, academicYearId: examSubject.exam.academicYearId },
        include: { teacher: true },
      }),
      this.documents.tryGetPhotoUrl("SCHOOL", schoolId),
    ]);

    // No dedicated grading-scale system exists in this codebase (checked
    // during Phase 1 inspection) — percentage is plain arithmetic, not a
    // grading-policy decision, and matches exactly what the Student/Parent
    // Portal already computes for a published result (see
    // StudentPortalService.getMyResults). A real letter-grade scale, if
    // wanted, is a separate feature to design deliberately, not something to
    // invent quietly here.
    const students = await Promise.all(
      enrollments.map(async (e) => {
        const result = e.results[0];
        const photoUrl = await this.documents.tryGetPhotoUrl("STUDENT", e.studentId);
        // An absent student has a result row but NO mark: they're resolved
        // (nothing left to enter) yet contribute no marks, no percentage and
        // nothing to the average — absence is never shown or counted as 0.
        const isAbsent = !!result?.isAbsent;
        const marks = result && !isAbsent ? result.marksObtained : null;
        return {
          enrollmentId: e.id,
          studentId: e.studentId,
          studentNumber: e.studentNumber,
          firstName: e.student.firstName,
          lastName: e.student.lastName,
          rollNumber: e.rollNumber,
          photoUrl,
          marksObtained: marks,
          percentage: marks !== null ? Math.round((Number(marks) / examSubject.maxMarks) * 1000) / 10 : null,
          hasMark: marks !== null,
          isAbsent,
        };
      }),
    );

    const completedCount = students.filter((s) => s.hasMark || s.isAbsent).length;
    const absentCount = students.filter((s) => s.isAbsent).length;
    const marks = students.map((s) => s.marksObtained).filter((m): m is Prisma.Decimal => m !== null).map((m) => Number(m));
    const average = marks.length > 0 ? Math.round((marks.reduce((a, b) => a + b, 0) / marks.length) * 100) / 100 : null;
    const highest = marks.length > 0 ? Math.max(...marks) : null;
    const lowest = marks.length > 0 ? Math.min(...marks) : null;

    return {
      context: {
        examId: examSubject.exam.id,
        examName: examSubject.exam.name,
        examType: examSubject.exam.type,
        academicYearId: examSubject.exam.academicYearId,
        academicYearName: examSubject.exam.academicYear.name,
        schoolName: examSubject.exam.school.name,
        schoolLogoUrl,
        className: examSubject.class.name,
        sectionName: section?.name ?? "",
        subjectName: examSubject.subject.name,
        examDate: examSubject.examDate,
        teacherName: assignment ? `${assignment.teacher.firstName} ${assignment.teacher.lastName}` : null,
      },
      maxMarks: examSubject.maxMarks,
      students,
      completedCount,
      absentCount,
      missingCount: students.length - completedCount,
      average,
      highest,
      lowest,
      submission: submission
        ? {
            status: submission.status,
            notes: submission.notes,
            submittedAt: submission.submittedAt,
            returnedAt: submission.returnedAt,
            returnReason: submission.returnReason,
            approvedAt: submission.approvedAt,
            publishedAt: submission.publishedAt,
          }
        : { status: "DRAFT" as const, notes: null, submittedAt: null, returnedAt: null, returnReason: null, approvedAt: null, publishedAt: null },
    };
  }

  async enterMarks(
    actor: AuthenticatedUser,
    schoolId: string,
    examSubjectId: string,
    sectionId: string,
    dto: EnterMarksDto,
  ) {
    const examSubject = await this.getExamSubjectInSchoolOrThrow(schoolId, examSubjectId);
    await this.assertCanAccessSectionForSubject(actor, schoolId, sectionId, examSubject.subjectId, examSubject.exam.academicYearId);
    await this.assertSectionBelongsToClass(sectionId, examSubject.classId);

    const enrollmentIds = dto.entries.map((e) => e.enrollmentId);

    // The enrollment must belong to THIS exam's academic year and section —
    // never just "some active enrollment somewhere". ACTIVE students can be
    // marked; a student who has since moved on (promoted, retained, or
    // transferred out) can only have an ALREADY-recorded result corrected,
    // never receive a brand-new one.
    const validEnrollments = await this.prisma.studentEnrollment.findMany({
      where: {
        id: { in: enrollmentIds },
        sectionId,
        academicYearId: examSubject.exam.academicYearId,
        OR: [{ status: "ACTIVE" }, { results: { some: { examSubjectId } } }],
      },
      select: { id: true, studentId: true, student: { select: { firstName: true, lastName: true } } },
    });
    const enrollmentById = new Map(validEnrollments.map((e) => [e.id, e]));
    const invalid = enrollmentIds.filter((id) => !enrollmentById.has(id));
    if (invalid.length > 0) {
      throw new BadRequestException(`These enrollments aren't active in this section: ${invalid.join(", ")}`);
    }

    for (const entry of dto.entries) {
      if (entry.isAbsent) {
        if (entry.marksObtained !== undefined && entry.marksObtained !== null) {
          throw new BadRequestException(`Enrollment ${entry.enrollmentId} can't be both absent and have a mark`);
        }
      } else if (entry.marksObtained === undefined || entry.marksObtained === null) {
        throw new BadRequestException(`Enrollment ${entry.enrollmentId} needs a mark, or must be marked absent`);
      } else if (entry.marksObtained > examSubject.maxMarks) {
        throw new BadRequestException(
          `Marks for enrollment ${entry.enrollmentId} exceed the max of ${examSubject.maxMarks}`,
        );
      }
    }

    // The submission's own status is the single source of truth for whether
    // marks can still be edited — DRAFT (nothing submitted yet) and
    // NEEDS_CORRECTION (an Admin explicitly reopened it) are the only
    // editable states. Result's own legacy status field is never consulted
    // here anymore (see Phase 2's migration notes on why it's still around).
    // A submitted/approved/published set is corrected by having an Admin
    // return it for correction first (see returnForCorrection) — never by
    // editing it in place.
    const existingSubmission = await this.prisma.resultSubmission.findUnique({
      where: { examSubjectId_sectionId: { examSubjectId, sectionId } },
    });
    if (existingSubmission && !["DRAFT", "NEEDS_CORRECTION"].includes(existingSubmission.status)) {
      throw new BadRequestException(
        `These results are ${existingSubmission.status.toLowerCase().replace("_", " ")} and can't be edited right now.`,
      );
    }

    // What each student currently has, so the audit trail can say exactly
    // what changed (old -> new) and unchanged rows can be left out of it.
    const existingResults = await this.prisma.result.findMany({
      where: { examSubjectId, enrollmentId: { in: enrollmentIds } },
      select: { enrollmentId: true, marksObtained: true, isAbsent: true },
    });
    const existingByEnrollment = new Map(existingResults.map((r) => [r.enrollmentId, r]));

    const changes: MarkChange[] = [];
    for (const entry of dto.entries) {
      const before = existingByEnrollment.get(entry.enrollmentId);
      const oldMark: MarkValue | null = before ? (before.isAbsent ? "ABSENT" : Number(before.marksObtained)) : null;
      const newMark: MarkValue = entry.isAbsent ? "ABSENT" : (entry.marksObtained as number);
      if (oldMark === newMark) continue;
      const enrollment = enrollmentById.get(entry.enrollmentId)!;
      changes.push({
        enrollmentId: entry.enrollmentId,
        studentId: enrollment.studentId,
        studentName: `${enrollment.student.firstName} ${enrollment.student.lastName}`,
        oldMark,
        newMark,
      });
    }

    const submission = await this.getOrCreateSubmission(examSubjectId, sectionId);

    await this.prisma.$transaction(
      dto.entries.map((entry) => {
        const marksObtained = entry.isAbsent ? null : (entry.marksObtained as number);
        const isAbsent = !!entry.isAbsent;
        return this.prisma.result.upsert({
          where: { examSubjectId_enrollmentId: { examSubjectId, enrollmentId: entry.enrollmentId } },
          update: { marksObtained, isAbsent, enteredByUserId: actor.id },
          create: {
            examSubjectId,
            enrollmentId: entry.enrollmentId,
            marksObtained,
            isAbsent,
            enteredByUserId: actor.id,
            resultSubmissionId: submission.id,
          },
        });
      }),
    );

    if (changes.length > 0) {
      const isCorrection = changes.some((c) => c.oldMark !== null);
      const section = await this.prisma.section.findUnique({ where: { id: sectionId } });
      await this.audit.record({
        actor,
        organizationId: actor.organizationId,
        schoolId,
        action: isCorrection ? AuditAction.RESULTS_CORRECTED : AuditAction.RESULTS_ENTERED,
        module: AuditModuleName.RESULTS,
        resourceType: "ExamSubject",
        resourceId: examSubjectId,
        resourceName: `${examSubject.exam.name} · ${examSubject.class.name} · Section ${section?.name ?? ""} · ${examSubject.subject.name}`,
        severity: isCorrection ? "WARNING" : "INFO",
        // Why a correction is happening, when the workflow recorded one:
        // the Admin's reason for returning these results.
        reason: existingSubmission?.status === "NEEDS_CORRECTION" ? existingSubmission.returnReason : null,
        after: {
          examId: examSubject.exam.id,
          examName: examSubject.exam.name,
          subjectName: examSubject.subject.name,
          className: examSubject.class.name,
          sectionId,
          maxMarks: examSubject.maxMarks,
          enteredCount: dto.entries.length,
          changedCount: changes.length,
          changes,
        },
      });
    }

    return this.getResultsForSection(actor, schoolId, examSubjectId, sectionId);
  }

  // "Submit for Review" (from DRAFT) and "Resubmit for Review" (from
  // NEEDS_CORRECTION, Part 9) are the same transition — the only thing that
  // differs is which audit action gets recorded, so there is no separate
  // resubmit method. Never trusts the frontend's own completed/missing
  // count: every active enrollment in the section is re-checked here.
  async submitForReview(actor: AuthenticatedUser, schoolId: string, examSubjectId: string, sectionId: string) {
    const examSubject = await this.getExamSubjectInSchoolOrThrow(schoolId, examSubjectId);
    await this.assertCanAccessSectionForSubject(actor, schoolId, sectionId, examSubject.subjectId, examSubject.exam.academicYearId);
    await this.assertSectionBelongsToClass(sectionId, examSubject.classId);

    const submission = await this.prisma.resultSubmission.findUnique({
      where: { examSubjectId_sectionId: { examSubjectId, sectionId } },
    });
    if (!submission) {
      throw new BadRequestException("Enter at least one mark before submitting for review");
    }
    if (!["DRAFT", "NEEDS_CORRECTION"].includes(submission.status)) {
      throw new BadRequestException(`This submission is already ${submission.status.toLowerCase().replace("_", " ")}`);
    }

    const [activeCount, resultCount] = await Promise.all([
      this.prisma.studentEnrollment.count({ where: { sectionId, academicYearId: examSubject.exam.academicYearId, status: "ACTIVE" } }),
      this.prisma.result.count({ where: { examSubjectId, resultSubmissionId: submission.id } }),
    ]);
    if (resultCount < activeCount) {
      throw new BadRequestException(`${activeCount - resultCount} student(s) still need marks before this can be submitted`);
    }

    const wasReturned = submission.status === "NEEDS_CORRECTION";
    await this.prisma.resultSubmission.update({
      where: { id: submission.id },
      data: { status: "SUBMITTED", submittedByUserId: actor.id, submittedAt: new Date() },
    });

    await this.audit.record({
      actor,
      organizationId: actor.organizationId,
      schoolId,
      action: wasReturned ? AuditAction.RESULTS_RESUBMITTED : AuditAction.RESULTS_SUBMITTED,
      module: AuditModuleName.RESULTS,
      resourceType: "ResultSubmission",
      resourceId: submission.id,
      after: { examSubjectId, sectionId, studentCount: activeCount },
    });

    const section = await this.prisma.section.findUnique({ where: { id: sectionId } });
    await this.notifications.notifySchoolStaffWithPermission(schoolId, "results.approve", {
      title: wasReturned ? "Corrected results resubmitted" : "Results submitted for review",
      body: `${examSubject.exam.name} · ${examSubject.class.name} · Section ${section?.name ?? ""} · ${examSubject.subject.name} — ${activeCount} student(s).`,
      actionUrl: this.resultsUrl(schoolId, examSubjectId, sectionId),
    });

    return this.getResultsForSection(actor, schoolId, examSubjectId, sectionId);
  }

  // Section-scoped — replaces the earlier whole-ExamSubject approve (never
  // used by any frontend, confirmed before removing it). That version could
  // approve a section whose teacher hadn't even submitted yet just because
  // a sibling section had; this one only ever acts on the one submission
  // it's given, and only once it's actually in the SUBMITTED state.
  async returnForCorrection(
    actor: AuthenticatedUser,
    schoolId: string,
    examSubjectId: string,
    sectionId: string,
    dto: ReturnForCorrectionDto,
  ) {
    const examSubject = await this.getExamSubjectInSchoolOrThrow(schoolId, examSubjectId);
    await this.schools.findOneAccessibleOrThrow(actor, schoolId);
    await this.assertSectionBelongsToClass(sectionId, examSubject.classId);

    const submission = await this.prisma.resultSubmission.findUnique({
      where: { examSubjectId_sectionId: { examSubjectId, sectionId } },
    });
    // SUBMITTED (still under review) or APPROVED (reviewed but not yet — or no
    // longer — published). APPROVED used to be a dead end: nothing could
    // reopen it, so a mistake found after approval (or after Undo Publish)
    // could never be corrected. A PUBLISHED set still has to be unpublished
    // first — that is a separate, reason-carrying step which this doesn't
    // bypass.
    if (!submission || !["SUBMITTED", "APPROVED"].includes(submission.status)) {
      throw new BadRequestException("Only a submitted or approved (not yet published) result set can be returned for correction");
    }
    const returnedFrom = submission.status;

    await this.prisma.resultSubmission.update({
      where: { id: submission.id },
      data: { status: "NEEDS_CORRECTION", returnedByUserId: actor.id, returnedAt: new Date(), returnReason: dto.reason },
    });

    await this.audit.record({
      actor,
      organizationId: actor.organizationId,
      schoolId,
      action: AuditAction.RESULTS_RETURNED,
      module: AuditModuleName.RESULTS,
      resourceType: "ResultSubmission",
      resourceId: submission.id,
      after: { examSubjectId, sectionId, reason: dto.reason, returnedFrom },
    });

    const teacherUserId = await this.resolveResponsibleTeacherUserId(sectionId, examSubject.subjectId, examSubject.exam.academicYearId);
    if (teacherUserId) {
      const section = await this.prisma.section.findUnique({ where: { id: sectionId } });
      await this.notifications.notifyUser(teacherUserId, {
        title: "Correction Required",
        body: `${examSubject.exam.name} · ${examSubject.class.name} · Section ${section?.name ?? ""} · ${examSubject.subject.name} — ${dto.reason}`,
        actionUrl: this.resultsUrl(schoolId, examSubjectId, sectionId),
      });
    }

    return this.getResultsForSection(actor, schoolId, examSubjectId, sectionId);
  }

  async approveSubmission(actor: AuthenticatedUser, schoolId: string, examSubjectId: string, sectionId: string) {
    const examSubject = await this.getExamSubjectInSchoolOrThrow(schoolId, examSubjectId);
    await this.schools.findOneAccessibleOrThrow(actor, schoolId);
    await this.assertSectionBelongsToClass(sectionId, examSubject.classId);

    const submission = await this.prisma.resultSubmission.findUnique({
      where: { examSubjectId_sectionId: { examSubjectId, sectionId } },
    });
    if (!submission || submission.status !== "SUBMITTED") {
      throw new BadRequestException("Only a submitted result set waiting for review can be approved");
    }

    await this.prisma.resultSubmission.update({
      where: { id: submission.id },
      data: { status: "APPROVED", approvedByUserId: actor.id, approvedAt: new Date() },
    });

    await this.audit.record({
      actor,
      organizationId: actor.organizationId,
      schoolId,
      action: AuditAction.RESULTS_APPROVED,
      module: AuditModuleName.RESULTS,
      resourceType: "ResultSubmission",
      resourceId: submission.id,
      after: { examSubjectId, sectionId },
    });

    const teacherUserId = await this.resolveResponsibleTeacherUserId(sectionId, examSubject.subjectId, examSubject.exam.academicYearId);
    if (teacherUserId) {
      const section = await this.prisma.section.findUnique({ where: { id: sectionId } });
      await this.notifications.notifyUser(teacherUserId, {
        title: "Results Approved",
        body: `${examSubject.exam.name} · ${examSubject.class.name} · Section ${section?.name ?? ""} · ${examSubject.subject.name} — approved, waiting to be published.`,
        actionUrl: this.resultsUrl(schoolId, examSubjectId, sectionId),
      });
    }

    return this.getResultsForSection(actor, schoolId, examSubjectId, sectionId);
  }

  // Publishing is the one action that actually changes what a Student/
  // Parent can see (StudentPortalService.myResults and
  // GuardianPortalService.myChildResults both filter on
  // resultSubmission.status = 'PUBLISHED') — everything before this point
  // (submit, return, approve) is purely internal to the school.
  async publishSubmission(actor: AuthenticatedUser, schoolId: string, examSubjectId: string, sectionId: string) {
    const examSubject = await this.getExamSubjectInSchoolOrThrow(schoolId, examSubjectId);
    await this.schools.findOneAccessibleOrThrow(actor, schoolId);
    await this.assertSectionBelongsToClass(sectionId, examSubject.classId);

    const submission = await this.prisma.resultSubmission.findUnique({
      where: { examSubjectId_sectionId: { examSubjectId, sectionId } },
    });
    if (!submission || submission.status !== "APPROVED") {
      throw new BadRequestException("Only an approved result set can be published");
    }

    await this.prisma.resultSubmission.update({
      where: { id: submission.id },
      data: { status: "PUBLISHED", publishedByUserId: actor.id, publishedAt: new Date() },
    });

    await this.audit.record({
      actor,
      organizationId: actor.organizationId,
      schoolId,
      action: AuditAction.RESULTS_PUBLISHED,
      module: AuditModuleName.RESULTS,
      resourceType: "ResultSubmission",
      resourceId: submission.id,
      severity: "WARNING",
      after: { examSubjectId, sectionId },
    });

    const teacherUserId = await this.resolveResponsibleTeacherUserId(sectionId, examSubject.subjectId, examSubject.exam.academicYearId);
    if (teacherUserId) {
      const section = await this.prisma.section.findUnique({ where: { id: sectionId } });
      await this.notifications.notifyUser(teacherUserId, {
        title: "Results Published",
        body: `${examSubject.exam.name} · ${examSubject.class.name} · Section ${section?.name ?? ""} · ${examSubject.subject.name} — now visible to students and parents.`,
        actionUrl: this.resultsUrl(schoolId, examSubjectId, sectionId),
      });
    }

    return this.getResultsForSection(actor, schoolId, examSubjectId, sectionId);
  }

  // The undo for publishSubmission — same reasoning in reverse: this is the
  // one action that removes what a Student/Parent can currently see, so (like
  // returnForCorrection) it requires a reason, which both the audit log and
  // the teacher's notification carry. Deliberately reverts to APPROVED, not
  // back through SUBMITTED — the results themselves aren't being questioned,
  // only whether they should be visible yet; the Admin can re-publish
  // immediately once ready, without making the teacher resubmit anything.
  async unpublishSubmission(
    actor: AuthenticatedUser,
    schoolId: string,
    examSubjectId: string,
    sectionId: string,
    dto: UnpublishResultsDto,
  ) {
    const examSubject = await this.getExamSubjectInSchoolOrThrow(schoolId, examSubjectId);
    await this.schools.findOneAccessibleOrThrow(actor, schoolId);
    await this.assertSectionBelongsToClass(sectionId, examSubject.classId);

    const submission = await this.prisma.resultSubmission.findUnique({
      where: { examSubjectId_sectionId: { examSubjectId, sectionId } },
    });
    if (!submission || submission.status !== "PUBLISHED") {
      throw new BadRequestException("Only a published result set can be unpublished");
    }

    await this.prisma.resultSubmission.update({
      where: { id: submission.id },
      data: { status: "APPROVED" },
    });

    await this.audit.record({
      actor,
      organizationId: actor.organizationId,
      schoolId,
      action: AuditAction.RESULTS_UNPUBLISHED,
      module: AuditModuleName.RESULTS,
      resourceType: "ResultSubmission",
      resourceId: submission.id,
      severity: "WARNING",
      after: { examSubjectId, sectionId, reason: dto.reason },
    });

    const teacherUserId = await this.resolveResponsibleTeacherUserId(sectionId, examSubject.subjectId, examSubject.exam.academicYearId);
    if (teacherUserId) {
      const section = await this.prisma.section.findUnique({ where: { id: sectionId } });
      await this.notifications.notifyUser(teacherUserId, {
        title: "Results Unpublished",
        body: `${examSubject.exam.name} · ${examSubject.class.name} · Section ${section?.name ?? ""} · ${examSubject.subject.name} — no longer visible to students and parents. ${dto.reason}`,
        actionUrl: this.resultsUrl(schoolId, examSubjectId, sectionId),
      });
    }

    return this.getResultsForSection(actor, schoolId, examSubjectId, sectionId);
  }

  // Admin-facing "Results Review" list — same viewpoint-scoping convention
  // as listExamPapers (and Transfers/Student Lifecycle before it): org-wide
  // when filters.schoolId is omitted and the actor has no schoolIds of
  // their own, otherwise scoped to their own school(s).
  async listResultSubmissions(actor: AuthenticatedUser, filters: ResultSubmissionListFilters) {
    const schoolIds = await this.resolveViewpointSchoolIds(actor, filters.schoolId);

    const where: Prisma.ResultSubmissionWhereInput = {
      AND: [
        schoolIds
          ? { examSubject: { exam: { schoolId: { in: schoolIds } } } }
          : { examSubject: { exam: { school: { organizationId: actor.organizationId! } } } },
        filters.academicYearId ? { examSubject: { exam: { academicYearId: filters.academicYearId } } } : {},
        filters.examId ? { examSubject: { examId: filters.examId } } : {},
        filters.classId ? { examSubject: { classId: filters.classId } } : {},
        filters.subjectId ? { examSubject: { subjectId: filters.subjectId } } : {},
        filters.sectionId ? { sectionId: filters.sectionId } : {},
        filters.status ? { status: filters.status } : {},
        filters.dateFrom ? { submittedAt: { gte: new Date(filters.dateFrom) } } : {},
        filters.dateTo ? { submittedAt: { lte: new Date(filters.dateTo) } } : {},
      ],
    };

    const submissions = await this.prisma.resultSubmission.findMany({
      where,
      include: {
        section: { include: { class: true } },
        examSubject: { include: { exam: { include: { school: true, academicYear: true } }, subject: true } },
      },
      orderBy: { updatedAt: "desc" },
    });

    const rows = await Promise.all(
      submissions.map(async (s) => {
        const assignment = await this.prisma.teacherAssignment.findFirst({
          where: { sectionId: s.sectionId, subjectId: s.examSubject.subjectId, academicYearId: s.examSubject.exam.academicYearId },
          include: { teacher: true },
        });
        // enrolledCount is this exam's own year's roster, closed enrollments
        // included — requiring status: "ACTIVE" here produced the impossible
        // "1/0 completed" display for any exam whose section has since moved
        // on to a new year (a real, permanent Result row from that historical
        // enrollment, divided by a roster miscounted as empty).
        const [enrolledCount, resultCount] = await Promise.all([
          this.prisma.studentEnrollment.count({
            where: { sectionId: s.sectionId, academicYearId: s.examSubject.exam.academicYearId },
          }),
          this.prisma.result.count({ where: { resultSubmissionId: s.id } }),
        ]);
        return {
          resultSubmissionId: s.id,
          examSubjectId: s.examSubjectId,
          examId: s.examSubject.exam.id,
          examName: s.examSubject.exam.name,
          schoolId: s.examSubject.exam.schoolId,
          schoolName: s.examSubject.exam.school.name,
          academicYearId: s.examSubject.exam.academicYearId,
          academicYearName: s.examSubject.exam.academicYear.name,
          classId: s.examSubject.classId,
          className: s.section.class.name,
          sectionId: s.sectionId,
          sectionName: s.section.name,
          subjectId: s.examSubject.subjectId,
          subjectName: s.examSubject.subject.name,
          teacherId: assignment?.teacherId ?? null,
          teacherName: assignment ? `${assignment.teacher.firstName} ${assignment.teacher.lastName}` : null,
          status: s.status,
          studentCount: enrolledCount,
          completedCount: resultCount,
          missingCount: enrolledCount - resultCount,
          submittedAt: s.submittedAt,
        };
      }),
    );

    return filters.teacherId ? rows.filter((r) => r.teacherId === filters.teacherId) : rows;
  }

  // Every (examSubject, section) combo a teacher is actually responsible
  // for, derived purely from their own TeacherAssignment rows — never from
  // anything the frontend sends. A School/Super Admin has no Teacher
  // profile and gets an empty list here, same as every other
  // teacher-scoped query in this codebase.
  async listMyExams(actor: AuthenticatedUser) {
    const teacher = await this.prisma.teacher.findFirst({ where: { userId: actor.id } });
    if (!teacher) return [];

    const assignments = await this.prisma.teacherAssignment.findMany({
      where: { teacherId: teacher.id },
      include: { section: { include: { class: true } }, subject: true, academicYear: true },
    });

    const rows = [];
    for (const a of assignments) {
      const examSubjects = await this.prisma.examSubject.findMany({
        where: { classId: a.section.classId, subjectId: a.subjectId, exam: { academicYearId: a.academicYearId } },
        include: { exam: true },
      });
      for (const es of examSubjects) {
        const submission = await this.prisma.resultSubmission.findUnique({
          where: { examSubjectId_sectionId: { examSubjectId: es.id, sectionId: a.sectionId } },
        });
        rows.push({
          examSubjectId: es.id,
          examId: es.exam.id,
          examName: es.exam.name,
          examType: es.exam.type,
          schoolId: a.schoolId,
          academicYearId: a.academicYearId,
          academicYearName: a.academicYear.name,
          classId: a.section.classId,
          className: a.section.class.name,
          sectionId: a.sectionId,
          sectionName: a.section.name,
          subjectId: a.subjectId,
          subjectName: a.subject.name,
          examDate: es.examDate,
          maxMarks: es.maxMarks,
          paperStatus: submission?.paperStatus ?? null,
          resultsStatus: submission?.status ?? "DRAFT",
          lastUpdated: submission?.updatedAt ?? es.createdAt,
        });
      }
    }
    return rows;
  }

  // Upload (or replace) the exam paper for one (examSubject, section). The
  // same endpoint backs both "Save Draft" and "Submit Exam Paper" — `submit`
  // decides which; a draft paper is never visible to the Admin's Exam
  // Papers list (see listExamPapers' status filter / the frontend only
  // rendering submitted ones there).
  async uploadExamPaper(
    actor: AuthenticatedUser,
    schoolId: string,
    examSubjectId: string,
    sectionId: string,
    file: Express.Multer.File,
    notes: string | undefined,
    submit: boolean,
  ) {
    const examSubject = await this.getExamSubjectInSchoolOrThrow(schoolId, examSubjectId);
    await this.assertCanAccessSectionForSubject(actor, schoolId, sectionId, examSubject.subjectId, examSubject.exam.academicYearId);
    await this.assertSectionBelongsToClass(sectionId, examSubject.classId);

    const submission = await this.getOrCreateSubmission(examSubjectId, sectionId);
    await this.documents.uploadResultSubmissionPaper(actor, schoolId, submission.id, file);

    const updated = await this.prisma.resultSubmission.update({
      where: { id: submission.id },
      data: {
        notes: notes ?? submission.notes,
        paperStatus: submit ? "SUBMITTED" : "DRAFT",
        paperSubmittedByUserId: submit ? actor.id : submission.paperSubmittedByUserId,
        paperSubmittedAt: submit ? new Date() : submission.paperSubmittedAt,
      },
    });

    if (submit) {
      await this.audit.record({
        actor,
        organizationId: actor.organizationId,
        schoolId,
        action: AuditAction.EXAM_PAPER_UPLOADED,
        module: AuditModuleName.RESULTS,
        resourceType: "ResultSubmission",
        resourceId: submission.id,
        after: { examSubjectId, sectionId, fileName: file.originalname },
      });

      const section = await this.prisma.section.findUnique({ where: { id: sectionId } });
      await this.notifications.notifySchoolStaffWithPermission(schoolId, "results.approve", {
        title: "Exam paper submitted",
        body: `${examSubject.exam.name} · ${examSubject.class.name} · Section ${section?.name ?? ""} · ${examSubject.subject.name} — exam paper submitted for review.`,
        actionUrl: this.resultsUrl(schoolId, examSubjectId, sectionId),
      });
    }

    return this.getExamPaper(actor, schoolId, examSubjectId, sectionId, updated);
  }

  async getExamPaper(
    actor: AuthenticatedUser,
    schoolId: string,
    examSubjectId: string,
    sectionId: string,
    knownSubmission?: { id: string; paperStatus: string | null; paperSubmittedByUserId: string | null; paperSubmittedAt: Date | null; notes: string | null },
  ) {
    const examSubject = await this.getExamSubjectInSchoolOrThrow(schoolId, examSubjectId);
    await this.assertCanAccessSectionForSubject(actor, schoolId, sectionId, examSubject.subjectId, examSubject.exam.academicYearId);

    const submission =
      knownSubmission ??
      (await this.prisma.resultSubmission.findUnique({ where: { examSubjectId_sectionId: { examSubjectId, sectionId } } }));

    if (!submission) {
      return { paperStatus: null, notes: null, paperSubmittedByUserId: null, paperSubmittedAt: null, file: null };
    }

    const file = await this.documents.getResultSubmissionPaper(submission.id);
    return {
      paperStatus: submission.paperStatus,
      notes: submission.notes,
      paperSubmittedByUserId: submission.paperSubmittedByUserId,
      paperSubmittedAt: submission.paperSubmittedAt,
      file,
    };
  }

  // Admin-facing "Exam Papers" list — org-wide when filters.schoolId is
  // omitted and the actor has no schoolIds of their own (Super/Org Admin),
  // otherwise scoped exactly like every other admin list in this codebase.
  // A Teacher also holds results.view (to see their own marks), so without
  // the extra narrowing below they could list every OTHER teacher's exam
  // paper submissions in their school(s) too — school-scoped isn't the same
  // as assignment-scoped.
  async listExamPapers(actor: AuthenticatedUser, filters: ExamPaperListFilters) {
    // Teacher-callable (results.view) and narrowed to the teacher's own
    // assignments below, so it uses the teacher-aware school gate.
    const schoolIds = await this.resolveViewpointSchoolIds(actor, filters.schoolId, { teacherScoped: true });

    const where: Prisma.ResultSubmissionWhereInput = {
      AND: [
        schoolIds ? { examSubject: { exam: { schoolId: { in: schoolIds } } } } : { examSubject: { exam: { school: { organizationId: actor.organizationId! } } } },
        filters.academicYearId ? { examSubject: { exam: { academicYearId: filters.academicYearId } } } : {},
        filters.examId ? { examSubject: { examId: filters.examId } } : {},
        filters.classId ? { examSubject: { classId: filters.classId } } : {},
        filters.subjectId ? { examSubject: { subjectId: filters.subjectId } } : {},
        filters.sectionId ? { sectionId: filters.sectionId } : {},
        filters.status ? { paperStatus: filters.status } : { paperStatus: { not: null } },
        filters.dateFrom ? { paperSubmittedAt: { gte: new Date(filters.dateFrom) } } : {},
        filters.dateTo ? { paperSubmittedAt: { lte: new Date(filters.dateTo) } } : {},
      ],
    };

    let submissions = await this.prisma.resultSubmission.findMany({
      where,
      include: {
        section: { include: { class: true } },
        examSubject: { include: { exam: { include: { school: true, academicYear: true } }, subject: true } },
      },
      orderBy: { paperSubmittedAt: "desc" },
    });

    const teacher = await this.prisma.teacher.findFirst({ where: { userId: actor.id } });
    if (teacher) {
      const assignments = await this.prisma.teacherAssignment.findMany({
        where: { teacherId: teacher.id },
        select: { sectionId: true, subjectId: true, academicYearId: true },
      });
      const allowedKeys = new Set(assignments.map((a) => `${a.sectionId}|${a.subjectId}|${a.academicYearId}`));
      submissions = submissions.filter((s) =>
        allowedKeys.has(`${s.sectionId}|${s.examSubject.subjectId}|${s.examSubject.exam.academicYearId}`),
      );
    }

    const rows = await Promise.all(
      submissions.map(async (s) => {
        const assignment = await this.prisma.teacherAssignment.findFirst({
          where: { sectionId: s.sectionId, subjectId: s.examSubject.subjectId, academicYearId: s.examSubject.exam.academicYearId },
          include: { teacher: true },
        });
        const file = await this.documents.getResultSubmissionPaper(s.id);
        return {
          resultSubmissionId: s.id,
          examId: s.examSubject.exam.id,
          examName: s.examSubject.exam.name,
          schoolId: s.examSubject.exam.schoolId,
          schoolName: s.examSubject.exam.school.name,
          academicYearName: s.examSubject.exam.academicYear.name,
          className: s.section.class.name,
          sectionId: s.sectionId,
          sectionName: s.section.name,
          subjectName: s.examSubject.subject.name,
          teacherId: assignment?.teacherId ?? null,
          teacherName: assignment ? `${assignment.teacher.firstName} ${assignment.teacher.lastName}` : null,
          examDate: s.examSubject.examDate,
          paperStatus: s.paperStatus,
          paperSubmittedAt: s.paperSubmittedAt,
          file,
        };
      }),
    );

    return filters.teacherId ? rows.filter((r) => r.teacherId === filters.teacherId) : rows;
  }

  // `teacherScoped` is opt-in and only for listings a teacher may legitimately
  // call (they are narrowed to the teacher's own assignments afterwards). The
  // admin-only review listing keeps the strict membership gate.
  private async resolveViewpointSchoolIds(
    actor: AuthenticatedUser,
    schoolId?: string,
    opts: { teacherScoped?: boolean } = {},
  ): Promise<string[] | undefined> {
    if (schoolId) {
      if (opts.teacherScoped) await this.schools.findOneAccessibleOrTeachingAtOrThrow(actor, schoolId);
      else await this.schools.findOneAccessibleOrThrow(actor, schoolId);
      return [schoolId];
    }
    if (actor.schoolIds.length > 0) return actor.schoolIds;
    return undefined;
  }

  // The per-(examSubject, section) submission row — created lazily the first
  // time a teacher enters any mark, same "the first write creates its own
  // container" shape as AttendanceService's upsert-by-composite-key. The
  // draft/submit/return/approve/publish pipeline itself (Phases 3-6) reads
  // and transitions this row; this phase only needs it to exist so every
  // Result can carry a valid resultSubmissionId.
  private async getOrCreateSubmission(examSubjectId: string, sectionId: string) {
    return this.prisma.resultSubmission.upsert({
      where: { examSubjectId_sectionId: { examSubjectId, sectionId } },
      update: {},
      create: { examSubjectId, sectionId },
    });
  }

  private async getExamInSchoolOrThrow(schoolId: string, examId: string) {
    const exam = await this.prisma.exam.findFirst({ where: { id: examId, schoolId } });
    if (!exam) throw new NotFoundException("Exam not found in this school");
    return exam;
  }

  private async getExamSubjectInSchoolOrThrow(schoolId: string, examSubjectId: string) {
    const examSubject = await this.prisma.examSubject.findFirst({
      where: { id: examSubjectId, exam: { schoolId } },
      include: { exam: { include: { academicYear: true, school: true } }, class: true, subject: true },
    });
    if (!examSubject) throw new NotFoundException("Exam subject not found in this school");
    return examSubject;
  }

  private async assertSectionBelongsToClass(sectionId: string, classId: string) {
    const section = await this.prisma.section.findFirst({ where: { id: sectionId, classId } });
    if (!section) throw new BadRequestException("That section does not belong to this exam subject's class");
  }

  // Same shape as AttendanceService's check, but also pinned to the specific
  // subject: a teacher may enter marks only where they hold a
  // TeacherAssignment for exactly this section+subject+academicYear.
  //
  // The teacher lookup is by userId ALONE — never {userId, schoolId}; see
  // the matching comment on AttendanceService.assertCanAccessSection for
  // why scoping this lookup by the route's schoolId would silently treat a
  // teacher with a legitimate cross-school assignment as an unrestricted
  // admin instead of checking it.
  private async assertCanAccessSectionForSubject(
    actor: AuthenticatedUser,
    schoolId: string,
    sectionId: string,
    subjectId: string,
    academicYearId: string,
  ) {
    // Teacher-aware school gate: a teacher assigned at a school other than
    // their home one is admitted here, and then held to the exact
    // section + subject + year assignment check just below.
    await this.schools.findOneAccessibleOrTeachingAtOrThrow(actor, schoolId);

    const teacher = await this.prisma.teacher.findFirst({ where: { userId: actor.id } });
    if (teacher) {
      const hasAssignment = await this.prisma.teacherAssignment.findFirst({
        where: { teacherId: teacher.id, sectionId, subjectId, academicYearId },
      });
      if (!hasAssignment) {
        throw new ForbiddenException("You are not assigned to teach this subject in this section for this year");
      }
    }
  }

  // One student's percentage for one term, from raw marks — never a stored,
  // separately-maintained number. SUM(marksObtained)/SUM(maxMarks) across
  // every PUBLISHED result this enrollment has for an exam belonging to
  // this term: a subject the student has no result for simply contributes
  // nothing to either sum (never a fabricated 0), and only PUBLISHED counts
  // as "finalized" — the exact same bar the Student/Parent Portal already
  // uses (see StudentPortalService.getMyResults), not a new rule invented
  // for promotion. Returns null ("Incomplete") when this enrollment has no
  // published results at all for this term yet.
  async getTermPercentage(enrollmentId: string, termId: string): Promise<number | null> {
    const results = await this.prisma.result.findMany({
      where: {
        enrollmentId,
        resultSubmission: { status: "PUBLISHED" },
        examSubject: { exam: { termId } },
        // An absent student has no mark: excluded from BOTH the marks and the
        // max-marks sums, so absence is never counted as a 0.
        isAbsent: false,
      },
      select: { marksObtained: true, examSubject: { select: { maxMarks: true } } },
    });
    if (results.length === 0) return null;

    const totalMarks = results.reduce((sum, r) => sum + Number(r.marksObtained), 0);
    const totalMax = results.reduce((sum, r) => sum + r.examSubject.maxMarks, 0);
    if (totalMax === 0) return null;
    return Math.round((totalMarks / totalMax) * 10000) / 100;
  }

  // Combines Term 1 + Term 2 using this academic year's own configured
  // weights (see Term.weight) — never a hard-coded 50/50. If either term
  // has zero published results, the annual result is genuinely
  // undetermined ("Incomplete"), not computed from the one term that does
  // exist and never defaulted to a failing 0 — a school with a real gap in
  // its data must see that gap, not a fabricated outcome.
  async getAnnualResult(
    enrollmentId: string,
    academicYearId: string,
  ): Promise<{
    term1Percentage: number | null;
    term2Percentage: number | null;
    annualPercentage: number | null;
    eligible: boolean | null;
  }> {
    const terms = await this.prisma.term.findMany({ where: { academicYearId } });
    const term1 = terms.find((t) => t.name === "Term 1");
    const term2 = terms.find((t) => t.name === "Term 2");
    if (!term1 || !term2) {
      return { term1Percentage: null, term2Percentage: null, annualPercentage: null, eligible: null };
    }

    const [term1Percentage, term2Percentage] = await Promise.all([
      this.getTermPercentage(enrollmentId, term1.id),
      this.getTermPercentage(enrollmentId, term2.id),
    ]);

    if (term1Percentage === null || term2Percentage === null) {
      return { term1Percentage, term2Percentage, annualPercentage: null, eligible: null };
    }

    const annualPercentage =
      Math.round((term1Percentage * (term1.weight / 100) + term2Percentage * (term2.weight / 100)) * 100) / 100;
    return { term1Percentage, term2Percentage, annualPercentage, eligible: annualPercentage >= 50 };
  }
}
