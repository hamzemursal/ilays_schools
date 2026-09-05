import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@school-erp/database";
import { PrismaService } from "../prisma/prisma.service";
import { SchoolsService } from "../schools/schools.service";
import { AuditService } from "../audit/audit.service";
import { AuditAction, AuditModuleName } from "../audit/audit-actions";
import { DocumentsService } from "../documents/documents.service";
import type { AuthenticatedUser } from "../auth/types/authenticated-user";
import { CreateExamDto } from "./dto/create-exam.dto";
import { CreateExamSubjectDto } from "./dto/create-exam-subject.dto";
import { EnterMarksDto } from "./dto/enter-marks.dto";
import { ReturnForCorrectionDto } from "./dto/return-for-correction.dto";

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

@Injectable()
export class ExamsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly schools: SchoolsService,
    private readonly audit: AuditService,
    private readonly documents: DocumentsService,
  ) {}

  async listExams(actor: AuthenticatedUser, schoolId: string) {
    await this.schools.findOneAccessibleOrThrow(actor, schoolId);
    return this.prisma.exam.findMany({
      where: { schoolId },
      include: { examSubjects: { include: { class: true, subject: true } } },
      orderBy: { createdAt: "desc" },
    });
  }

  async createExam(actor: AuthenticatedUser, schoolId: string, dto: CreateExamDto) {
    await this.schools.findOneAccessibleOrThrow(actor, schoolId);

    const year = await this.prisma.academicYear.findFirst({ where: { id: dto.academicYearId, schoolId } });
    if (!year) throw new BadRequestException("That academic year does not belong to this school");

    try {
      return await this.prisma.exam.create({
        data: { schoolId, academicYearId: dto.academicYearId, name: dto.name, type: dto.type },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictException("An exam with this name already exists for this academic year");
      }
      throw error;
    }
  }

  async listExamSubjects(actor: AuthenticatedUser, schoolId: string, examId: string) {
    await this.schools.findOneAccessibleOrThrow(actor, schoolId);
    await this.getExamInSchoolOrThrow(schoolId, examId);
    return this.prisma.examSubject.findMany({ where: { examId }, include: { class: true, subject: true } });
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

  async getResultsForSection(actor: AuthenticatedUser, schoolId: string, examSubjectId: string, sectionId: string) {
    const examSubject = await this.getExamSubjectInSchoolOrThrow(schoolId, examSubjectId);
    await this.assertCanAccessSectionForSubject(actor, schoolId, sectionId, examSubject.subjectId, examSubject.exam.academicYearId);
    await this.assertSectionBelongsToClass(sectionId, examSubject.classId);

    const enrollments = await this.prisma.studentEnrollment.findMany({
      where: { sectionId, academicYearId: examSubject.exam.academicYearId, status: "ACTIVE" },
      include: { student: true, results: { where: { examSubjectId } } },
      orderBy: { rollNumber: "asc" },
    });

    const submission = await this.prisma.resultSubmission.findUnique({
      where: { examSubjectId_sectionId: { examSubjectId, sectionId } },
    });

    const [section, assignment] = await Promise.all([
      this.prisma.section.findUnique({ where: { id: sectionId } }),
      this.prisma.teacherAssignment.findFirst({
        where: { sectionId, subjectId: examSubject.subjectId, academicYearId: examSubject.exam.academicYearId },
        include: { teacher: true },
      }),
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
        return {
          enrollmentId: e.id,
          studentId: e.studentId,
          studentNumber: e.studentNumber,
          firstName: e.student.firstName,
          lastName: e.student.lastName,
          rollNumber: e.rollNumber,
          photoUrl,
          marksObtained: result?.marksObtained ?? null,
          percentage: result ? Math.round((Number(result.marksObtained) / examSubject.maxMarks) * 1000) / 10 : null,
          hasMark: !!result,
        };
      }),
    );

    const completedCount = students.filter((s) => s.hasMark).length;
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
        className: examSubject.class.name,
        sectionName: section?.name ?? "",
        subjectName: examSubject.subject.name,
        examDate: examSubject.examDate,
        teacherName: assignment ? `${assignment.teacher.firstName} ${assignment.teacher.lastName}` : null,
      },
      maxMarks: examSubject.maxMarks,
      students,
      completedCount,
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
    const validEnrollments = await this.prisma.studentEnrollment.findMany({
      where: { id: { in: enrollmentIds }, sectionId, status: "ACTIVE" },
      select: { id: true },
    });
    const validIds = new Set(validEnrollments.map((e) => e.id));
    const invalid = enrollmentIds.filter((id) => !validIds.has(id));
    if (invalid.length > 0) {
      throw new BadRequestException(`These enrollments aren't active in this section: ${invalid.join(", ")}`);
    }

    for (const entry of dto.entries) {
      if (entry.marksObtained > examSubject.maxMarks) {
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
    const existingSubmission = await this.prisma.resultSubmission.findUnique({
      where: { examSubjectId_sectionId: { examSubjectId, sectionId } },
    });
    if (existingSubmission && !["DRAFT", "NEEDS_CORRECTION"].includes(existingSubmission.status)) {
      throw new BadRequestException(
        `These results are ${existingSubmission.status.toLowerCase().replace("_", " ")} and can't be edited right now.`,
      );
    }

    const submission = await this.getOrCreateSubmission(examSubjectId, sectionId);

    await this.prisma.$transaction(
      dto.entries.map((entry) =>
        this.prisma.result.upsert({
          where: { examSubjectId_enrollmentId: { examSubjectId, enrollmentId: entry.enrollmentId } },
          update: { marksObtained: entry.marksObtained, enteredByUserId: actor.id },
          create: {
            examSubjectId,
            enrollmentId: entry.enrollmentId,
            marksObtained: entry.marksObtained,
            enteredByUserId: actor.id,
            resultSubmissionId: submission.id,
          },
        }),
      ),
    );

    await this.audit.record({
      actor,
      organizationId: actor.organizationId,
      schoolId,
      action: AuditAction.RESULTS_ENTERED,
      module: AuditModuleName.RESULTS,
      resourceType: "ExamSubject",
      resourceId: examSubjectId,
      after: { enteredCount: dto.entries.length },
    });

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
    if (!submission || submission.status !== "SUBMITTED") {
      throw new BadRequestException("Only a submitted result set waiting for review can be returned");
    }

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
      after: { examSubjectId, sectionId, reason: dto.reason },
    });

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
        const [activeCount, resultCount] = await Promise.all([
          this.prisma.studentEnrollment.count({
            where: { sectionId: s.sectionId, academicYearId: s.examSubject.exam.academicYearId, status: "ACTIVE" },
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
          studentCount: activeCount,
          completedCount: resultCount,
          missingCount: activeCount - resultCount,
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
  async listExamPapers(actor: AuthenticatedUser, filters: ExamPaperListFilters) {
    const schoolIds = await this.resolveViewpointSchoolIds(actor, filters.schoolId);

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

    const submissions = await this.prisma.resultSubmission.findMany({
      where,
      include: {
        section: { include: { class: true } },
        examSubject: { include: { exam: { include: { school: true, academicYear: true } }, subject: true } },
      },
      orderBy: { paperSubmittedAt: "desc" },
    });

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

  private async resolveViewpointSchoolIds(actor: AuthenticatedUser, schoolId?: string): Promise<string[] | undefined> {
    if (schoolId) {
      await this.schools.findOneAccessibleOrThrow(actor, schoolId);
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
      include: { exam: { include: { academicYear: true } }, class: true, subject: true },
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
  private async assertCanAccessSectionForSubject(
    actor: AuthenticatedUser,
    schoolId: string,
    sectionId: string,
    subjectId: string,
    academicYearId: string,
  ) {
    await this.schools.findOneAccessibleOrThrow(actor, schoolId);

    const teacher = await this.prisma.teacher.findFirst({ where: { userId: actor.id, schoolId } });
    if (teacher) {
      const hasAssignment = await this.prisma.teacherAssignment.findFirst({
        where: { teacherId: teacher.id, sectionId, subjectId, academicYearId },
      });
      if (!hasAssignment) {
        throw new ForbiddenException("You are not assigned to teach this subject in this section for this year");
      }
    }
  }
}
