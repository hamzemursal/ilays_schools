import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@school-erp/database";
import { PrismaService } from "../prisma/prisma.service";
import { SchoolsService } from "../schools/schools.service";
import { AuditService } from "../audit/audit.service";
import { AuditAction, AuditModuleName } from "../audit/audit-actions";
import type { AuthenticatedUser } from "../auth/types/authenticated-user";
import { CreateExamDto } from "./dto/create-exam.dto";
import { CreateExamSubjectDto } from "./dto/create-exam-subject.dto";
import { EnterMarksDto } from "./dto/enter-marks.dto";

@Injectable()
export class ExamsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly schools: SchoolsService,
    private readonly audit: AuditService,
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

    return {
      maxMarks: examSubject.maxMarks,
      students: enrollments.map((e) => ({
        enrollmentId: e.id,
        firstName: e.student.firstName,
        lastName: e.student.lastName,
        rollNumber: e.rollNumber,
        marksObtained: e.results[0]?.marksObtained ?? null,
        status: e.results[0]?.status ?? null,
      })),
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

    const existing = await this.prisma.result.findMany({
      where: { examSubjectId, enrollmentId: { in: enrollmentIds } },
    });
    const approvedIds = existing.filter((r) => r.status === "APPROVED").map((r) => r.enrollmentId);
    if (approvedIds.length > 0) {
      throw new BadRequestException(`These results are already approved and can't be edited: ${approvedIds.join(", ")}`);
    }

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

  async approveResults(actor: AuthenticatedUser, schoolId: string, examSubjectId: string) {
    await this.schools.findOneAccessibleOrThrow(actor, schoolId);
    await this.getExamSubjectInSchoolOrThrow(schoolId, examSubjectId);

    const result = await this.prisma.result.updateMany({
      where: { examSubjectId, status: "ENTERED" },
      data: { status: "APPROVED", approvedByUserId: actor.id },
    });

    await this.audit.record({
      actor,
      organizationId: actor.organizationId,
      schoolId,
      action: AuditAction.RESULTS_APPROVED,
      module: AuditModuleName.RESULTS,
      resourceType: "ExamSubject",
      resourceId: examSubjectId,
      after: { approvedCount: result.count },
    });

    return { approvedCount: result.count };
  }

  private async getExamInSchoolOrThrow(schoolId: string, examId: string) {
    const exam = await this.prisma.exam.findFirst({ where: { id: examId, schoolId } });
    if (!exam) throw new NotFoundException("Exam not found in this school");
    return exam;
  }

  private async getExamSubjectInSchoolOrThrow(schoolId: string, examSubjectId: string) {
    const examSubject = await this.prisma.examSubject.findFirst({
      where: { id: examSubjectId, exam: { schoolId } },
      include: { exam: true },
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
