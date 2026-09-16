import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { AttendanceSession, type AttendanceStatus } from "@school-erp/database";
import { PrismaService } from "../prisma/prisma.service";
import { SchoolsService } from "../schools/schools.service";
import { StudentsService } from "../students/students.service";
import { AuditService } from "../audit/audit.service";
import { AuditAction, AuditModuleName } from "../audit/audit-actions";
import { DocumentsService } from "../documents/documents.service";
import type { AuthenticatedUser } from "../auth/types/authenticated-user";
import { MarkAttendanceDto } from "./dto/mark-attendance.dto";

// Every pre-existing Attendance/AttendanceDraft row was backfilled to
// MORNING by the migration's column default (see schema.prisma on
// Attendance) — this is also the session a caller gets when it doesn't
// specify one, so nothing that predates sessions ever needs to guess.
const DEFAULT_SESSION = AttendanceSession.MORNING;

@Injectable()
export class AttendanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly schools: SchoolsService,
    private readonly students: StudentsService,
    private readonly audit: AuditService,
    private readonly documents: DocumentsService,
  ) {}

  // Sections are long-lived and reused across academic years (a Section
  // itself carries no yearId), so "current" has to be resolved via the
  // school's own AcademicYear.isCurrent flag rather than inferred from the
  // section. Returns null if no year is marked current for this school —
  // callers must treat that as "no current assignment can exist," never as
  // "skip the check."
  private async resolveCurrentAcademicYearId(schoolId: string): Promise<string | null> {
    const year = await this.prisma.academicYear.findFirst({ where: { schoolId, isCurrent: true } });
    return year?.id ?? null;
  }

  // Editing/marking access — a teacher may mark or manage attendance only
  // for a section they hold a TeacherAssignment for IN THE CURRENT
  // academic year. A past assignment (from a year they've since moved on
  // from) grants read-only history access (see
  // assertCanViewSectionHistory below), never this.
  //
  // The teacher lookup is by userId ALONE — never {userId, schoolId}. A
  // Teacher row's own schoolId is just its home/employment school; a
  // teacher can hold TeacherAssignments (and therefore real access) at
  // other schools too, so filtering this lookup by the route's schoolId
  // would silently return null for a legitimate cross-school assignment —
  // and this function's own "if (teacher)" shape would then treat that
  // teacher as an unrestricted admin for that section instead of checking
  // their assignment at all. Always resolve the teacher profile first, then
  // let the TeacherAssignment check below be the only thing that decides
  // access — sectionId alone already pins the check to one specific school.
  private async assertCanEditSection(actor: AuthenticatedUser, schoolId: string, sectionId: string) {
    await this.schools.findOneAccessibleOrThrow(actor, schoolId);

    const teacher = await this.prisma.teacher.findFirst({ where: { userId: actor.id } });
    if (!teacher) return;

    const currentYearId = await this.resolveCurrentAcademicYearId(schoolId);
    const hasCurrentAssignment =
      currentYearId &&
      (await this.prisma.teacherAssignment.findFirst({
        where: { teacherId: teacher.id, sectionId, academicYearId: currentYearId },
      }));
    if (!hasCurrentAssignment) {
      throw new ForbiddenException("You are not currently assigned to this section");
    }
  }

  // History-viewing access — broader than assertCanEditSection: a teacher
  // who once held (but no longer holds, this academic year) an assignment
  // for this section may still view its history, but only the records
  // they personally recorded (markedByUserId), never a colleague's. A
  // teacher with a CURRENT assignment sees the section's full history
  // unrestricted, same as always. Admins (no Teacher profile) are always
  // unrestricted.
  private async assertCanViewSectionHistory(
    actor: AuthenticatedUser,
    schoolId: string,
    sectionId: string,
  ): Promise<{ restrictToOwnRecords: boolean }> {
    await this.schools.findOneAccessibleOrThrow(actor, schoolId);

    const teacher = await this.prisma.teacher.findFirst({ where: { userId: actor.id } });
    if (!teacher) return { restrictToOwnRecords: false };

    const hasAnyAssignment = await this.prisma.teacherAssignment.findFirst({
      where: { teacherId: teacher.id, sectionId },
    });
    if (!hasAnyAssignment) {
      throw new ForbiddenException("You are not assigned to this section");
    }

    const currentYearId = await this.resolveCurrentAcademicYearId(schoolId);
    const hasCurrentAssignment =
      currentYearId &&
      (await this.prisma.teacherAssignment.findFirst({
        where: { teacherId: teacher.id, sectionId, academicYearId: currentYearId },
      }));

    return { restrictToOwnRecords: !hasCurrentAssignment };
  }

  // Mirrors assertCanEditSection's shape, but for "one student, all their
  // attendance" rather than "one section" — a teacher may only see a
  // student's history if that student is currently enrolled in a section
  // the teacher holds any TeacherAssignment for. Admins (no Teacher
  // profile) are unrestricted here too, same as the section-level checks.
  // Deliberately not narrowed to markedByUserId the way
  // assertCanViewSectionHistory narrows historyForSection/summaryForSection
  // — historyForStudent spans a student's whole enrollment history across
  // however many sections/years they've moved through, so "current vs
  // stale" would have to be evaluated per past enrollment, not once for the
  // whole call. Out of scope for this pass; flagged, not silently dropped.
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

  // Comparing the raw "YYYY-MM-DD" strings directly (not Date objects) sorts
  // exactly like chronological order for this format, so there's no
  // timezone-parsing pitfall to worry about — attendance genuinely can't be
  // taken for a day that, from the server's own clock, hasn't happened yet.
  private assertNotFutureDate(dateString: string) {
    const todayString = new Date().toISOString().slice(0, 10);
    if (dateString > todayString) {
      throw new BadRequestException("Attendance cannot be marked for a future date");
    }
  }

  private async getSectionInSchoolOrThrow(schoolId: string, sectionId: string) {
    const section = await this.prisma.section.findFirst({
      where: { id: sectionId, class: { division: { schoolId } } },
    });
    if (!section) throw new NotFoundException("Section not found in this school");
    return section;
  }

  async getForSectionAndDate(
    actor: AuthenticatedUser,
    schoolId: string,
    sectionId: string,
    date: string,
    session: AttendanceSession = DEFAULT_SESSION,
  ) {
    await this.assertCanEditSection(actor, schoolId, sectionId);
    await this.getSectionInSchoolOrThrow(schoolId, sectionId);

    const enrollments = await this.prisma.studentEnrollment.findMany({
      where: { sectionId, status: "ACTIVE" },
      include: {
        student: true,
        attendances: { where: { date: new Date(date), session } },
        attendanceDrafts: { where: { date: new Date(date), session } },
      },
      orderBy: { rollNumber: "asc" },
    });

    // A submitted (Attendance) row always wins over a draft for the same
    // day — once finalized, the draft is stale even if mark() somehow left
    // it behind. isDraft only ever true when there's a draft AND no
    // submitted row yet, which is exactly "resume where you left off."
    return Promise.all(
      enrollments.map(async (e) => {
        const submitted = e.attendances[0];
        const draft = e.attendanceDrafts[0];
        // Same tryGetPhotoUrl-per-row pattern as
        // TeachersService.myAssignmentStudents — a teacher marking
        // attendance only holds attendance.mark/view, never students.view,
        // so this can't go through the students.view-gated photo endpoint.
        const photoUrl = await this.documents.tryGetPhotoUrl("STUDENT", e.studentId);
        return {
          enrollmentId: e.id,
          studentId: e.studentId,
          firstName: e.student.firstName,
          lastName: e.student.lastName,
          rollNumber: e.rollNumber,
          status: submitted?.status ?? draft?.status ?? null,
          note: submitted?.note ?? draft?.note ?? null,
          isDraft: !submitted && !!draft,
          photoUrl,
        };
      }),
    );
  }

  // Powers the "Attendance Status" banner at the top of a section's
  // attendance page — whether EACH of today's two sessions has been
  // finalized yet, independent of whichever session the teacher currently
  // has selected in the dropdown below. "Recorded" means at least one real
  // (submitted, not draft) Attendance row exists for that session on this
  // date — never inferred from absence, so an un-recorded session is never
  // shown or treated as if every student were marked Absent.
  async getSessionStatusForSectionAndDate(actor: AuthenticatedUser, schoolId: string, sectionId: string, date: string) {
    await this.assertCanEditSection(actor, schoolId, sectionId);
    await this.getSectionInSchoolOrThrow(schoolId, sectionId);

    const recorded = await this.prisma.attendance.findMany({
      where: { date: new Date(date), enrollment: { sectionId } },
      select: { session: true },
      distinct: ["session"],
    });
    const recordedSessions = new Set(recorded.map((r) => r.session));

    return {
      [AttendanceSession.MORNING]: recordedSessions.has(AttendanceSession.MORNING),
      [AttendanceSession.AFTERNOON]: recordedSessions.has(AttendanceSession.AFTERNOON),
    };
  }

  // "Save as Draft" — used when a teacher wants to leave partway through
  // marking without losing what they've entered so far, but isn't ready to
  // finalize it as the section's real attendance for the day. Deliberately
  // never touches the real Attendance table, so nothing that reads
  // Attendance directly (dashboard, reports, parent/student portals) can
  // ever see an unfinished day as if it were real attendance.
  async saveDraft(actor: AuthenticatedUser, schoolId: string, sectionId: string, dto: MarkAttendanceDto) {
    await this.assertCanEditSection(actor, schoolId, sectionId);
    await this.getSectionInSchoolOrThrow(schoolId, sectionId);
    this.assertNotFutureDate(dto.date);

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
    const session = dto.session;

    await this.prisma.$transaction(
      dto.entries.map((e) =>
        this.prisma.attendanceDraft.upsert({
          where: { enrollmentId_date_session: { enrollmentId: e.enrollmentId, date, session } },
          update: { status: e.status, note: e.note, savedByUserId: actor.id },
          create: {
            enrollmentId: e.enrollmentId,
            date,
            session,
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
      after: { date: dto.date, session, studentCount: dto.entries.length },
    });

    return this.getForSectionAndDate(actor, schoolId, sectionId, dto.date, session);
  }

  async mark(actor: AuthenticatedUser, schoolId: string, sectionId: string, dto: MarkAttendanceDto) {
    await this.assertCanEditSection(actor, schoolId, sectionId);
    await this.getSectionInSchoolOrThrow(schoolId, sectionId);
    this.assertNotFutureDate(dto.date);

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
    const session = dto.session;

    await this.prisma.$transaction([
      ...dto.entries.map((e) =>
        this.prisma.attendance.upsert({
          where: { enrollmentId_date_session: { enrollmentId: e.enrollmentId, date, session } },
          update: { status: e.status, note: e.note, markedByUserId: actor.id },
          create: {
            enrollmentId: e.enrollmentId,
            date,
            session,
            status: e.status,
            note: e.note,
            markedByUserId: actor.id,
          },
        }),
      ),
      // Finalizing supersedes whatever draft got it here — leaving the draft
      // behind would make the section look like it still had unfinished
      // attendance for a day+session that's now actually submitted. Scoped
      // to this session only — the other session's draft (if any) is a
      // separate, still-unfinished thing and must survive this.
      this.prisma.attendanceDraft.deleteMany({ where: { enrollmentId: { in: enrollmentIds }, date, session } }),
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
      after: { date: dto.date, session, studentCount: dto.entries.length },
    });

    return this.getForSectionAndDate(actor, schoolId, sectionId, dto.date, session);
  }

  async historyForSection(actor: AuthenticatedUser, schoolId: string, sectionId: string, from?: string, to?: string) {
    const { restrictToOwnRecords } = await this.assertCanViewSectionHistory(actor, schoolId, sectionId);
    await this.getSectionInSchoolOrThrow(schoolId, sectionId);

    return this.prisma.attendance.findMany({
      where: {
        enrollment: { sectionId },
        ...(restrictToOwnRecords ? { markedByUserId: actor.id } : {}),
        ...(from || to
          ? { date: { ...(from ? { gte: new Date(from) } : {}), ...(to ? { lte: new Date(to) } : {}) } }
          : {}),
      },
      include: { enrollment: { select: { rollNumber: true, student: { select: { firstName: true, lastName: true } } } } },
      orderBy: [{ date: "desc" }],
    });
  }

  async summaryForSection(actor: AuthenticatedUser, schoolId: string, sectionId: string, from?: string, to?: string) {
    const { restrictToOwnRecords } = await this.assertCanViewSectionHistory(actor, schoolId, sectionId);
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
      where: {
        enrollment: { sectionId },
        ...(restrictToOwnRecords ? { markedByUserId: actor.id } : {}),
        ...dateFilter,
      },
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

  // Whole-school, per-section "has today been marked yet" — powers the
  // School Admin's Attendance overview cards, where opening every section
  // individually just to check would defeat the point of the overview.
  // Deliberately not run through assertCanEditSection/assertCanViewSectionHistory:
  // unlike every other method here, this spans every section in the school at once, which is
  // exactly the School Admin use case (the same admin-only reports.view
  // gate as the enrollment report this page already loads), not a
  // teacher's own-section view.
  async getStatusForDate(actor: AuthenticatedUser, schoolId: string, date: string) {
    await this.schools.findOneAccessibleOrThrow(actor, schoolId);
    const d = new Date(date);

    const [submitted, drafts] = await Promise.all([
      this.prisma.attendance.findMany({
        where: { date: d, enrollment: { schoolId } },
        select: { enrollment: { select: { sectionId: true } } },
      }),
      this.prisma.attendanceDraft.findMany({
        where: { date: d, enrollment: { schoolId } },
        select: { enrollment: { select: { sectionId: true } } },
      }),
    ]);

    return {
      markedSectionIds: [...new Set(submitted.map((r) => r.enrollment.sectionId))],
      draftSectionIds: [...new Set(drafts.map((r) => r.enrollment.sectionId))],
    };
  }

  // Powers the Student List's Attendance column/filter — one rate per
  // active enrollment matching the given school/year/class/section filters,
  // for whatever's actually been marked across that academic year's own
  // date range (there's no separate Term model in this schema, so the year
  // itself is the correct existing structure to scope by, same reasoning as
  // summaryForSection scoping by an explicit from/to). A student with zero
  // marked days gets `rate: null` — never a fabricated 0%.
  // Built for the Student List's admin-facing Attendance column/filter, but
  // reachable by anyone holding attendance.view — which every Teacher does,
  // to view their own sections. Without a teacher-scoping check here, a
  // Teacher could request rates for the WHOLE school (classId/sectionId are
  // optional) rather than just their own assigned sections; a School/Super
  // Admin (no Teacher profile) is unaffected. An explicit sectionId that
  // isn't one of the teacher's own is rejected outright, rather than
  // silently narrowed — the caller shouldn't be able to tell "empty
  // results" apart from "not your section" here.
  async attendanceRatesForSchool(
    actor: AuthenticatedUser,
    schoolId: string,
    filters: { academicYearId: string; classId?: string; sectionId?: string },
  ) {
    await this.schools.findOneAccessibleOrThrow(actor, schoolId);

    const academicYear = await this.prisma.academicYear.findFirst({
      where: { id: filters.academicYearId, schoolId },
    });
    if (!academicYear) throw new BadRequestException("That academic year does not belong to this school");

    const teacher = await this.prisma.teacher.findFirst({ where: { userId: actor.id } });
    let allowedSectionIds: string[] | null = null;
    if (teacher) {
      const assignments = await this.prisma.teacherAssignment.findMany({
        where: { teacherId: teacher.id, schoolId, academicYearId: filters.academicYearId },
        select: { sectionId: true },
      });
      allowedSectionIds = [...new Set(assignments.map((a) => a.sectionId))];
      if (filters.sectionId && !allowedSectionIds.includes(filters.sectionId)) {
        throw new ForbiddenException("You are not assigned to this section");
      }
    }

    const counts = await this.prisma.attendance.groupBy({
      by: ["enrollmentId", "status"],
      where: {
        date: { gte: academicYear.startDate, lte: academicYear.endDate },
        enrollment: {
          schoolId,
          academicYearId: filters.academicYearId,
          status: "ACTIVE",
          ...(filters.classId ? { classId: filters.classId } : {}),
          sectionId: filters.sectionId ? filters.sectionId : (allowedSectionIds ? { in: allowedSectionIds } : undefined),
        },
      },
      _count: true,
    });

    const byEnrollment = new Map<string, { present: number; total: number }>();
    for (const row of counts) {
      const bucket = byEnrollment.get(row.enrollmentId) ?? { present: 0, total: 0 };
      bucket.total += row._count;
      if (row.status === "PRESENT") bucket.present += row._count;
      byEnrollment.set(row.enrollmentId, bucket);
    }

    return Array.from(byEnrollment.entries()).map(([enrollmentId, { present, total }]) => ({
      enrollmentId,
      rate: total > 0 ? Math.round((present / total) * 1000) / 10 : null,
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
      include: { enrollment: { include: { school: true, class: true, section: true, academicYear: true } } },
      orderBy: { date: "desc" },
    });
  }

  // Bulk "today's attendance, both sessions" for the Advanced Student List —
  // one query for however many enrollments are on the page, never one query
  // per row. No per-section TeacherAssignment check here (unlike the
  // section-scoped methods above): this is an admin-level cross-section
  // view, gated by the attendance.view permission at the controller/caller
  // level, the same way summaryForSection's admin-only sibling
  // getStatusForDate already works. An enrollment with no row for a session
  // gets `null` — the caller must render that as "Not Recorded", never
  // "Absent".
  async getTodayStatusForEnrollments(
    enrollmentIds: string[],
    date: string,
  ): Promise<Map<string, Record<AttendanceSession, AttendanceStatus | null>>> {
    const result = new Map<string, Record<AttendanceSession, AttendanceStatus | null>>();
    for (const id of enrollmentIds) {
      result.set(id, { MORNING: null, AFTERNOON: null });
    }
    if (enrollmentIds.length === 0) return result;

    const rows = await this.prisma.attendance.findMany({
      where: { enrollmentId: { in: enrollmentIds }, date: new Date(date) },
      select: { enrollmentId: true, session: true, status: true },
    });
    for (const row of rows) {
      result.get(row.enrollmentId)![row.session] = row.status;
    }
    return result;
  }
}
