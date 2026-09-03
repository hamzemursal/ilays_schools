import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { SchoolsService } from "../schools/schools.service";
import { StudentsService } from "../students/students.service";
import { AuditService } from "../audit/audit.service";
import { AuditAction, AuditModuleName } from "../audit/audit-actions";
import type { AuthenticatedUser } from "../auth/types/authenticated-user";
import { MarkAttendanceDto } from "./dto/mark-attendance.dto";

@Injectable()
export class AttendanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly schools: SchoolsService,
    private readonly students: StudentsService,
    private readonly audit: AuditService,
  ) {}

  // A teacher (identified by a Teacher profile linked to this actor) may
  // only touch a section they hold a TeacherAssignment for. A School/Super
  // Admin has no Teacher profile, so this check is a no-op for them beyond
  // the ordinary school-access check — this is the Phase 6 gate.
  private async assertCanAccessSection(actor: AuthenticatedUser, schoolId: string, sectionId: string) {
    await this.schools.findOneAccessibleOrThrow(actor, schoolId);

    const teacher = await this.prisma.teacher.findFirst({ where: { userId: actor.id, schoolId } });
    if (teacher) {
      const hasAssignment = await this.prisma.teacherAssignment.findFirst({
        where: { teacherId: teacher.id, sectionId },
      });
      if (!hasAssignment) {
        throw new ForbiddenException("You are not assigned to this section");
      }
    }
  }

  // Mirrors assertCanAccessSection, but for "one student, all their
  // attendance" rather than "one section" — a teacher may only see a
  // student's history if that student is currently enrolled in a section
  // the teacher holds any TeacherAssignment for. Admins (no Teacher
  // profile) are unrestricted here too, same as the section-level check.
  private async assertTeacherCanAccessStudent(actor: AuthenticatedUser, studentId: string) {
    const teacher = await this.prisma.teacher.findFirst({ where: { userId: actor.id } });
    if (!teacher) return;

    const enrollment = await this.prisma.studentEnrollment.findFirst({
      where: {
        studentId,
        status: "ACTIVE",
        section: { teacherAssignments: { some: { teacherId: teacher.id } } },
      },
    });
    if (!enrollment) {
      throw new ForbiddenException("You are not assigned to this student's section");
    }
  }

  private async getSectionInSchoolOrThrow(schoolId: string, sectionId: string) {
    const section = await this.prisma.section.findFirst({
      where: { id: sectionId, class: { division: { schoolId } } },
    });
    if (!section) throw new NotFoundException("Section not found in this school");
    return section;
  }

  async getForSectionAndDate(actor: AuthenticatedUser, schoolId: string, sectionId: string, date: string) {
    await this.assertCanAccessSection(actor, schoolId, sectionId);
    await this.getSectionInSchoolOrThrow(schoolId, sectionId);

    const enrollments = await this.prisma.studentEnrollment.findMany({
      where: { sectionId, status: "ACTIVE" },
      include: {
        student: true,
        attendances: { where: { date: new Date(date) } },
        attendanceDrafts: { where: { date: new Date(date) } },
      },
      orderBy: { rollNumber: "asc" },
    });

    // A submitted (Attendance) row always wins over a draft for the same
    // day — once finalized, the draft is stale even if mark() somehow left
    // it behind. isDraft only ever true when there's a draft AND no
    // submitted row yet, which is exactly "resume where you left off."
    return enrollments.map((e) => {
      const submitted = e.attendances[0];
      const draft = e.attendanceDrafts[0];
      return {
        enrollmentId: e.id,
        studentId: e.studentId,
        firstName: e.student.firstName,
        lastName: e.student.lastName,
        rollNumber: e.rollNumber,
        status: submitted?.status ?? draft?.status ?? null,
        note: submitted?.note ?? draft?.note ?? null,
        isDraft: !submitted && !!draft,
      };
    });
  }

  // "Save as Draft" — used when a teacher wants to leave partway through
  // marking without losing what they've entered so far, but isn't ready to
  // finalize it as the section's real attendance for the day. Deliberately
  // never touches the real Attendance table, so nothing that reads
  // Attendance directly (dashboard, reports, parent/student portals) can
  // ever see an unfinished day as if it were real attendance.
  async saveDraft(actor: AuthenticatedUser, schoolId: string, sectionId: string, dto: MarkAttendanceDto) {
    await this.assertCanAccessSection(actor, schoolId, sectionId);
    await this.getSectionInSchoolOrThrow(schoolId, sectionId);

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

    const date = new Date(dto.date);

    await this.prisma.$transaction(
      dto.entries.map((e) =>
        this.prisma.attendanceDraft.upsert({
          where: { enrollmentId_date: { enrollmentId: e.enrollmentId, date } },
          update: { status: e.status, note: e.note, savedByUserId: actor.id },
          create: {
            enrollmentId: e.enrollmentId,
            date,
            status: e.status,
            note: e.note,
            savedByUserId: actor.id,
          },
        }),
      ),
    );

    await this.audit.record({
      actor,
      organizationId: actor.organizationId,
      schoolId,
      action: AuditAction.ATTENDANCE_DRAFT_SAVED,
      module: AuditModuleName.ATTENDANCE,
      resourceType: "Section",
      resourceId: sectionId,
      after: { date: dto.date, studentCount: dto.entries.length },
    });

    return this.getForSectionAndDate(actor, schoolId, sectionId, dto.date);
  }

  async mark(actor: AuthenticatedUser, schoolId: string, sectionId: string, dto: MarkAttendanceDto) {
    await this.assertCanAccessSection(actor, schoolId, sectionId);
    await this.getSectionInSchoolOrThrow(schoolId, sectionId);

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

    const date = new Date(dto.date);

    await this.prisma.$transaction([
      ...dto.entries.map((e) =>
        this.prisma.attendance.upsert({
          where: { enrollmentId_date: { enrollmentId: e.enrollmentId, date } },
          update: { status: e.status, note: e.note, markedByUserId: actor.id },
          create: {
            enrollmentId: e.enrollmentId,
            date,
            status: e.status,
            note: e.note,
            markedByUserId: actor.id,
          },
        }),
      ),
      // Finalizing supersedes whatever draft got it here — leaving the draft
      // behind would make the section look like it still had unfinished
      // attendance for a day that's now actually submitted.
      this.prisma.attendanceDraft.deleteMany({ where: { enrollmentId: { in: enrollmentIds }, date } }),
    ]);

    // Not inside the transaction above — that one uses $transaction's array
    // form (a fixed list of promises built up front), which has no `tx`
    // handle to hand the audit write. Attendance is already durably saved
    // by the time this runs; a failure here would only cost this one
    // event's own audit trail, not the attendance itself.
    await this.audit.record({
      actor,
      organizationId: actor.organizationId,
      schoolId,
      action: AuditAction.ATTENDANCE_MARKED,
      module: AuditModuleName.ATTENDANCE,
      resourceType: "Section",
      resourceId: sectionId,
      after: { date: dto.date, studentCount: dto.entries.length },
    });

    return this.getForSectionAndDate(actor, schoolId, sectionId, dto.date);
  }

  async historyForSection(actor: AuthenticatedUser, schoolId: string, sectionId: string, from?: string, to?: string) {
    await this.assertCanAccessSection(actor, schoolId, sectionId);
    await this.getSectionInSchoolOrThrow(schoolId, sectionId);

    return this.prisma.attendance.findMany({
      where: {
        enrollment: { sectionId },
        ...(from || to
          ? { date: { ...(from ? { gte: new Date(from) } : {}), ...(to ? { lte: new Date(to) } : {}) } }
          : {}),
      },
      include: { enrollment: { select: { rollNumber: true, student: { select: { firstName: true, lastName: true } } } } },
      orderBy: [{ date: "desc" }],
    });
  }

  async summaryForSection(actor: AuthenticatedUser, schoolId: string, sectionId: string, from?: string, to?: string) {
    await this.assertCanAccessSection(actor, schoolId, sectionId);
    await this.getSectionInSchoolOrThrow(schoolId, sectionId);

    const enrollments = await this.prisma.studentEnrollment.findMany({
      where: { sectionId, status: "ACTIVE" },
      include: { student: true },
      orderBy: { rollNumber: "asc" },
    });

    const dateFilter =
      from || to ? { date: { ...(from ? { gte: new Date(from) } : {}), ...(to ? { lte: new Date(to) } : {}) } } : {};

    const counts = await this.prisma.attendance.groupBy({
      by: ["enrollmentId", "status"],
      where: { enrollment: { sectionId }, ...dateFilter },
      _count: true,
    });

    const byEnrollment = new Map<string, { present: number; absent: number; late: number; excused: number }>();
    for (const row of counts) {
      const bucket = byEnrollment.get(row.enrollmentId) ?? { present: 0, absent: 0, late: 0, excused: 0 };
      if (row.status === "PRESENT") bucket.present = row._count;
      else if (row.status === "ABSENT") bucket.absent = row._count;
      else if (row.status === "LATE") bucket.late = row._count;
      else if (row.status === "EXCUSED") bucket.excused = row._count;
      byEnrollment.set(row.enrollmentId, bucket);
    }

    return enrollments.map((e) => ({
      enrollmentId: e.id,
      firstName: e.student.firstName,
      lastName: e.student.lastName,
      rollNumber: e.rollNumber,
      ...(byEnrollment.get(e.id) ?? { present: 0, absent: 0, late: 0, excused: 0 }),
    }));
  }

  async historyForStudent(actor: AuthenticatedUser, studentId: string) {
    await this.students.assertAccessibleStudent(actor, studentId);
    await this.assertTeacherCanAccessStudent(actor, studentId);

    return this.prisma.attendance.findMany({
      where: {
        enrollment: {
          studentId,
          ...(actor.schoolIds.length > 0 ? { schoolId: { in: actor.schoolIds } } : {}),
        },
      },
      include: { enrollment: { include: { school: true, class: true, section: true } } },
      orderBy: { date: "desc" },
    });
  }
}
