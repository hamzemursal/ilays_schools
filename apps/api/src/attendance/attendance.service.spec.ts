import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { AttendanceSession } from "@school-erp/database";
import type { AuthenticatedUser } from "../auth/types/authenticated-user";
import { AttendanceService } from "./attendance.service";
import { PrismaService } from "../prisma/prisma.service";
import { SchoolsService } from "../schools/schools.service";
import { StudentsService } from "../students/students.service";
import { AuditService } from "../audit/audit.service";
import { DocumentsService } from "../documents/documents.service";
import type { MarkAttendanceDto } from "./dto/mark-attendance.dto";

const ADMIN_ACTOR: AuthenticatedUser = {
  id: "admin-1",
  email: "admin@example.com",
  organizationId: "org-1",
  roles: ["SCHOOL_ADMIN"],
  permissions: ["attendance.mark"],
  schoolIds: ["school-1"],
};

const TEACHER_ACTOR: AuthenticatedUser = {
  id: "teacher-user-1",
  email: "teacher@example.com",
  organizationId: "org-1",
  roles: ["TEACHER"],
  permissions: ["attendance.mark", "attendance.view"],
  schoolIds: ["school-1"],
};

function tomorrow(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function dto(date: string, session: AttendanceSession = AttendanceSession.MORNING): MarkAttendanceDto {
  return { date, session, entries: [{ enrollmentId: "enr-1", status: "PRESENT" }] };
}

describe("AttendanceService — future-date guard", () => {
  let prisma: {
    teacher: { findFirst: jest.Mock };
    section: { findFirst: jest.Mock };
    studentEnrollment: { findMany: jest.Mock };
    attendance: { upsert: jest.Mock; findMany: jest.Mock };
    attendanceDraft: { upsert: jest.Mock; deleteMany: jest.Mock };
    $transaction: jest.Mock;
  };
  let schools: { findOneAccessibleOrThrow: jest.Mock };
  let service: AttendanceService;

  beforeEach(() => {
    prisma = {
      teacher: { findFirst: jest.fn().mockResolvedValue(null) }, // actor is an Admin, not a Teacher
      section: { findFirst: jest.fn().mockResolvedValue({ id: "section-1" }) },
      studentEnrollment: { findMany: jest.fn().mockResolvedValue([{ id: "enr-1" }]) },
      attendance: { upsert: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
      attendanceDraft: { upsert: jest.fn(), deleteMany: jest.fn() },
      $transaction: jest.fn().mockResolvedValue(undefined),
    };
    schools = { findOneAccessibleOrThrow: jest.fn().mockResolvedValue(undefined) };
    service = new AttendanceService(
      prisma as unknown as PrismaService,
      schools as unknown as SchoolsService,
      {} as unknown as StudentsService,
      { record: jest.fn() } as unknown as AuditService,
      {} as unknown as DocumentsService,
    );
    // getForSectionAndDate does its own separate round of queries (including
    // photo lookups) that this test isn't about — short-circuited here so
    // each test only exercises the guard being verified.
    jest.spyOn(service, "getForSectionAndDate").mockResolvedValue([]);
  });

  it("mark() rejects a future date before touching any enrollment or attendance data", async () => {
    await expect(service.mark(ADMIN_ACTOR, "school-1", "section-1", dto(tomorrow()))).rejects.toThrow(
      BadRequestException,
    );
    await expect(service.mark(ADMIN_ACTOR, "school-1", "section-1", dto(tomorrow()))).rejects.toThrow(
      "Attendance cannot be marked for a future date",
    );
    expect(prisma.studentEnrollment.findMany).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("mark() accepts today's date", async () => {
    await expect(service.mark(ADMIN_ACTOR, "school-1", "section-1", dto(today()))).resolves.toEqual([]);
    expect(prisma.$transaction).toHaveBeenCalled();
  });

  it("saveDraft() rejects a future date before touching any enrollment or attendance data", async () => {
    await expect(service.saveDraft(ADMIN_ACTOR, "school-1", "section-1", dto(tomorrow()))).rejects.toThrow(
      "Attendance cannot be marked for a future date",
    );
    expect(prisma.studentEnrollment.findMany).not.toHaveBeenCalled();
  });

  it("saveDraft() accepts today's date", async () => {
    await expect(service.saveDraft(ADMIN_ACTOR, "school-1", "section-1", dto(today()))).resolves.toEqual([]);
    expect(prisma.$transaction).toHaveBeenCalled();
  });
});

describe("AttendanceService — session selection", () => {
  let prisma: {
    teacher: { findFirst: jest.Mock };
    section: { findFirst: jest.Mock };
    studentEnrollment: { findMany: jest.Mock };
    attendance: { upsert: jest.Mock };
    attendanceDraft: { upsert: jest.Mock; deleteMany: jest.Mock };
    $transaction: jest.Mock;
  };
  let service: AttendanceService;

  beforeEach(() => {
    prisma = {
      teacher: { findFirst: jest.fn().mockResolvedValue(null) },
      section: { findFirst: jest.fn().mockResolvedValue({ id: "section-1" }) },
      studentEnrollment: { findMany: jest.fn().mockResolvedValue([{ id: "enr-1" }]) },
      attendance: { upsert: jest.fn() },
      attendanceDraft: { upsert: jest.fn(), deleteMany: jest.fn() },
      // Runs the array of prepared operations through as-is, same shape
      // $transaction's array form actually returns.
      $transaction: jest.fn().mockImplementation((ops: unknown[]) => Promise.all(ops)),
    };
    service = new AttendanceService(
      prisma as unknown as PrismaService,
      { findOneAccessibleOrThrow: jest.fn().mockResolvedValue(undefined) } as unknown as SchoolsService,
      {} as unknown as StudentsService,
      { record: jest.fn() } as unknown as AuditService,
      {} as unknown as DocumentsService,
    );
    jest.spyOn(service, "getForSectionAndDate").mockResolvedValue([]);
  });

  it("mark() with Morning Session writes to the enrollmentId_date_session key with session MORNING", async () => {
    await service.mark(ADMIN_ACTOR, "school-1", "section-1", dto(today(), AttendanceSession.MORNING));
    expect(prisma.attendance.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { enrollmentId_date_session: expect.objectContaining({ enrollmentId: "enr-1", session: "MORNING" }) },
        create: expect.objectContaining({ session: "MORNING" }),
      }),
    );
  });

  it("mark() with Afternoon Session writes with session AFTERNOON, and only clears that session's draft", async () => {
    await service.mark(ADMIN_ACTOR, "school-1", "section-1", dto(today(), AttendanceSession.AFTERNOON));
    expect(prisma.attendance.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { enrollmentId_date_session: expect.objectContaining({ session: "AFTERNOON" }) },
        create: expect.objectContaining({ session: "AFTERNOON" }),
      }),
    );
    expect(prisma.attendanceDraft.deleteMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ session: "AFTERNOON" }) }),
    );
  });

  it("saveDraft() includes the given session in its upsert key — this is what gives duplicate-submission protection: resubmitting the same student/date/session/section upserts the same row instead of creating a second one", async () => {
    await service.saveDraft(ADMIN_ACTOR, "school-1", "section-1", dto(today(), AttendanceSession.AFTERNOON));
    expect(prisma.attendanceDraft.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { enrollmentId_date_session: expect.objectContaining({ enrollmentId: "enr-1", session: "AFTERNOON" }) },
      }),
    );
  });

  it("getForSectionAndDate defaults to Morning Session when none is given", async () => {
    (service.getForSectionAndDate as jest.Mock).mockRestore();
    prisma.studentEnrollment.findMany.mockResolvedValue([]);
    await service.getForSectionAndDate(ADMIN_ACTOR, "school-1", "section-1", today());
    expect(prisma.studentEnrollment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        include: expect.objectContaining({
          attendances: { where: expect.objectContaining({ session: "MORNING" }) },
        }),
      }),
    );
  });
});

describe("AttendanceService — session status (the top-of-page banner)", () => {
  let prisma: { teacher: { findFirst: jest.Mock }; attendance: { findMany: jest.Mock }; section: { findFirst: jest.Mock } };
  let service: AttendanceService;

  beforeEach(() => {
    prisma = {
      teacher: { findFirst: jest.fn().mockResolvedValue(null) }, // actor is an Admin, not a Teacher
      attendance: { findMany: jest.fn() },
      section: { findFirst: jest.fn().mockResolvedValue({ id: "section-1" }) },
    };
    service = new AttendanceService(
      prisma as unknown as PrismaService,
      { findOneAccessibleOrThrow: jest.fn().mockResolvedValue(undefined) } as unknown as SchoolsService,
      {} as unknown as StudentsService,
      { record: jest.fn() } as unknown as AuditService,
      {} as unknown as DocumentsService,
    );
  });

  it("reports Morning recorded and Afternoon not recorded", async () => {
    prisma.attendance.findMany.mockResolvedValue([{ session: "MORNING" }]);
    const status = await service.getSessionStatusForSectionAndDate(ADMIN_ACTOR, "school-1", "section-1", today());
    expect(status).toEqual({ MORNING: true, AFTERNOON: false });
  });

  it("reports both sessions recorded once both exist", async () => {
    prisma.attendance.findMany.mockResolvedValue([{ session: "MORNING" }, { session: "AFTERNOON" }]);
    const status = await service.getSessionStatusForSectionAndDate(ADMIN_ACTOR, "school-1", "section-1", today());
    expect(status).toEqual({ MORNING: true, AFTERNOON: true });
  });

  it("reports neither session recorded — this is 'Not Recorded', never inferred as Absent", async () => {
    prisma.attendance.findMany.mockResolvedValue([]);
    const status = await service.getSessionStatusForSectionAndDate(ADMIN_ACTOR, "school-1", "section-1", today());
    expect(status).toEqual({ MORNING: false, AFTERNOON: false });
  });
});

describe("AttendanceService.getTodayStatusForEnrollments — Advanced Student List's bulk Attendance Today column", () => {
  let prisma: { attendance: { findMany: jest.Mock } };
  let service: AttendanceService;

  beforeEach(() => {
    prisma = { attendance: { findMany: jest.fn().mockResolvedValue([]) } };
    service = new AttendanceService(
      prisma as unknown as PrismaService,
      {} as unknown as SchoolsService,
      {} as unknown as StudentsService,
      { record: jest.fn() } as unknown as AuditService,
      {} as unknown as DocumentsService,
    );
  });

  it("returns an empty map without querying for an empty id list", async () => {
    const result = await service.getTodayStatusForEnrollments([], today());
    expect(result.size).toBe(0);
    expect(prisma.attendance.findMany).not.toHaveBeenCalled();
  });

  it("gives every requested enrollment both sessions as null (Not Recorded) with no data", async () => {
    const result = await service.getTodayStatusForEnrollments(["enr-1", "enr-2"], today());
    expect(result.get("enr-1")).toEqual({ MORNING: null, AFTERNOON: null });
    expect(result.get("enr-2")).toEqual({ MORNING: null, AFTERNOON: null });
  });

  it("fills in the real status for whichever session/enrollment has a record, in one query for all ids", async () => {
    prisma.attendance.findMany.mockResolvedValue([
      { enrollmentId: "enr-1", session: "MORNING", status: "PRESENT" },
      { enrollmentId: "enr-2", session: "AFTERNOON", status: "ABSENT" },
    ]);
    const result = await service.getTodayStatusForEnrollments(["enr-1", "enr-2"], today());
    expect(result.get("enr-1")).toEqual({ MORNING: "PRESENT", AFTERNOON: null });
    expect(result.get("enr-2")).toEqual({ MORNING: null, AFTERNOON: "ABSENT" });
    expect(prisma.attendance.findMany).toHaveBeenCalledTimes(1);
  });
});

describe("AttendanceService — teacher authorization (school/section isolation)", () => {
  let prisma: {
    teacher: { findFirst: jest.Mock };
    teacherAssignment: { findFirst: jest.Mock };
    academicYear: { findFirst: jest.Mock };
    section: { findFirst: jest.Mock };
  };
  let schools: { findOneAccessibleOrThrow: jest.Mock };
  let service: AttendanceService;

  beforeEach(() => {
    prisma = {
      teacher: { findFirst: jest.fn().mockResolvedValue({ id: "teacher-profile-1" }) },
      teacherAssignment: { findFirst: jest.fn() },
      // A current academic year exists by default in every test here — the
      // handful of tests specifically about staleness override this.
      academicYear: { findFirst: jest.fn().mockResolvedValue({ id: "year-current" }) },
      section: { findFirst: jest.fn().mockResolvedValue({ id: "section-1" }) },
    };
    schools = { findOneAccessibleOrThrow: jest.fn().mockResolvedValue(undefined) };
    service = new AttendanceService(
      prisma as unknown as PrismaService,
      schools as unknown as SchoolsService,
      {} as unknown as StudentsService,
      { record: jest.fn() } as unknown as AuditService,
      {} as unknown as DocumentsService,
    );
  });

  it("rejects a teacher who has no TeacherAssignment for this section — a real security boundary, not just frontend filtering", async () => {
    prisma.teacherAssignment.findFirst.mockResolvedValue(null); // no assignment to this (or any) section
    await expect(
      service.getSessionStatusForSectionAndDate(TEACHER_ACTOR, "school-1", "other-teachers-section", today()),
    ).rejects.toThrow(ForbiddenException);
    await expect(
      service.getSessionStatusForSectionAndDate(TEACHER_ACTOR, "school-1", "other-teachers-section", today()),
    ).rejects.toThrow("You are not currently assigned to this section");
  });

  it("allows a teacher who does hold a TeacherAssignment for this section", async () => {
    prisma.teacherAssignment.findFirst.mockResolvedValue({ id: "assignment-1" });
    const prismaWithAttendance = prisma as unknown as PrismaService & { attendance: { findMany: jest.Mock } };
    (prismaWithAttendance as unknown as { attendance: unknown }).attendance = { findMany: jest.fn().mockResolvedValue([]) };
    await expect(
      service.getSessionStatusForSectionAndDate(TEACHER_ACTOR, "school-1", "section-1", today()),
    ).resolves.toEqual({ MORNING: false, AFTERNOON: false });
    expect(schools.findOneAccessibleOrThrow).toHaveBeenCalledWith(TEACHER_ACTOR, "school-1");
  });

  // Regression for a real bug: the teacher profile lookup used to be
  // {userId, schoolId} — for a teacher whose Teacher row's home school
  // differs from the route's schoolId (exactly the shape a multi-school
  // teacher has), that lookup silently returns null, and this function's
  // own "if (teacher)" shape then treats them as an unrestricted admin for
  // that section instead of checking their TeacherAssignment at all. The
  // lookup must be by userId alone — sectionId is what pins the check to
  // one school, not filtering the teacher lookup itself.
  it("resolves the teacher profile by userId alone, never scoped by the route's schoolId", async () => {
    prisma.teacherAssignment.findFirst.mockResolvedValue(null);
    await expect(
      service.getSessionStatusForSectionAndDate(TEACHER_ACTOR, "a-different-school", "some-section", today()),
    ).rejects.toThrow("You are not currently assigned to this section");
    expect(prisma.teacher.findFirst).toHaveBeenCalledWith({ where: { userId: TEACHER_ACTOR.id } });
  });

  // A TeacherAssignment for this section exists, but not for the school's
  // CURRENT academic year — e.g. the teacher taught this section last year
  // and has since moved on. Editing must be refused even though a
  // matching row is technically found by a bare {teacherId, sectionId}
  // lookup; only historyForSection/summaryForSection (below) may still be
  // reached, and only in their own read-only, own-records-only form.
  it("rejects editing when the only TeacherAssignment for this section is for a past academic year, not the current one", async () => {
    // Simulates the real query shape: filtering by academicYearId: "year-current"
    // finds nothing, because the teacher's real row is for "year-2026".
    prisma.teacherAssignment.findFirst.mockImplementation(({ where }) =>
      where.academicYearId === "year-current" ? Promise.resolve(null) : Promise.resolve({ id: "stale-assignment" }),
    );
    await expect(
      service.getSessionStatusForSectionAndDate(TEACHER_ACTOR, "school-1", "section-1", today()),
    ).rejects.toThrow("You are not currently assigned to this section");
  });

  it("rejects editing outright when no academic year is marked current for this school", async () => {
    prisma.academicYear.findFirst.mockResolvedValue(null);
    prisma.teacherAssignment.findFirst.mockResolvedValue({ id: "assignment-1" });
    await expect(
      service.getSessionStatusForSectionAndDate(TEACHER_ACTOR, "school-1", "section-1", today()),
    ).rejects.toThrow("You are not currently assigned to this section");
  });
});

describe("AttendanceService — historical view vs. current editing (Phase 5)", () => {
  let prisma: {
    teacher: { findFirst: jest.Mock };
    teacherAssignment: { findFirst: jest.Mock };
    academicYear: { findFirst: jest.Mock };
    section: { findFirst: jest.Mock };
    studentEnrollment: { findMany: jest.Mock };
    attendance: { findMany: jest.Mock; groupBy: jest.Mock };
  };
  let schools: { findOneAccessibleOrThrow: jest.Mock };
  let service: AttendanceService;

  beforeEach(() => {
    prisma = {
      teacher: { findFirst: jest.fn().mockResolvedValue({ id: "teacher-profile-1" }) },
      teacherAssignment: { findFirst: jest.fn() },
      academicYear: { findFirst: jest.fn().mockResolvedValue({ id: "year-current" }) },
      section: { findFirst: jest.fn().mockResolvedValue({ id: "section-1" }) },
      studentEnrollment: { findMany: jest.fn().mockResolvedValue([]) },
      attendance: { findMany: jest.fn().mockResolvedValue([]), groupBy: jest.fn().mockResolvedValue([]) },
    };
    schools = { findOneAccessibleOrThrow: jest.fn().mockResolvedValue(undefined) };
    service = new AttendanceService(
      prisma as unknown as PrismaService,
      schools as unknown as SchoolsService,
      {} as unknown as StudentsService,
      { record: jest.fn() } as unknown as AuditService,
      {} as unknown as DocumentsService,
    );
  });

  it("historyForSection throws ForbiddenException for a teacher with no TeacherAssignment for this section at all, ever", async () => {
    prisma.teacherAssignment.findFirst.mockResolvedValue(null);
    await expect(service.historyForSection(TEACHER_ACTOR, "school-1", "section-1")).rejects.toThrow(ForbiddenException);
    await expect(service.historyForSection(TEACHER_ACTOR, "school-1", "section-1")).rejects.toThrow(
      "You are not assigned to this section",
    );
  });

  it("historyForSection returns the section's full history, unrestricted, for a teacher with a CURRENT assignment", async () => {
    prisma.teacherAssignment.findFirst.mockResolvedValue({ id: "current-assignment" }); // matches every where-shape
    await service.historyForSection(TEACHER_ACTOR, "school-1", "section-1");
    const where = prisma.attendance.findMany.mock.calls[0][0].where;
    expect(where.markedByUserId).toBeUndefined();
  });

  it("historyForSection restricts to the teacher's own markedByUserId records when their only assignment here is a past one", async () => {
    prisma.teacherAssignment.findFirst.mockImplementation(({ where }) =>
      where.academicYearId === "year-current" ? Promise.resolve(null) : Promise.resolve({ id: "stale-assignment" }),
    );
    await service.historyForSection(TEACHER_ACTOR, "school-1", "section-1");
    const where = prisma.attendance.findMany.mock.calls[0][0].where;
    expect(where.markedByUserId).toBe(TEACHER_ACTOR.id);
  });

  it("historyForSection is never restricted for an Admin (no Teacher profile)", async () => {
    prisma.teacher.findFirst.mockResolvedValue(null);
    await service.historyForSection(ADMIN_ACTOR, "school-1", "section-1");
    const where = prisma.attendance.findMany.mock.calls[0][0].where;
    expect(where.markedByUserId).toBeUndefined();
    expect(prisma.teacherAssignment.findFirst).not.toHaveBeenCalled();
  });

  it("summaryForSection restricts its groupBy counts to the teacher's own records when their only assignment here is a past one", async () => {
    prisma.teacherAssignment.findFirst.mockImplementation(({ where }) =>
      where.academicYearId === "year-current" ? Promise.resolve(null) : Promise.resolve({ id: "stale-assignment" }),
    );
    await service.summaryForSection(TEACHER_ACTOR, "school-1", "section-1");
    const where = prisma.attendance.groupBy.mock.calls[0][0].where;
    expect(where.markedByUserId).toBe(TEACHER_ACTOR.id);
  });

  it("summaryForSection is unrestricted for a teacher with a current assignment", async () => {
    prisma.teacherAssignment.findFirst.mockResolvedValue({ id: "current-assignment" });
    await service.summaryForSection(TEACHER_ACTOR, "school-1", "section-1");
    const where = prisma.attendance.groupBy.mock.calls[0][0].where;
    expect(where.markedByUserId).toBeUndefined();
  });
});

describe("AttendanceService.attendanceRatesForSchool — teacher narrowing (Phase 3)", () => {
  let prisma: {
    teacher: { findFirst: jest.Mock };
    teacherAssignment: { findMany: jest.Mock };
    academicYear: { findFirst: jest.Mock };
    attendance: { groupBy: jest.Mock };
  };
  let schools: { findOneAccessibleOrThrow: jest.Mock };
  let service: AttendanceService;

  const YEAR = { id: "year-1", startDate: new Date("2027-01-01"), endDate: new Date("2027-12-31") };

  beforeEach(() => {
    prisma = {
      teacher: { findFirst: jest.fn() },
      teacherAssignment: { findMany: jest.fn() },
      academicYear: { findFirst: jest.fn().mockResolvedValue(YEAR) },
      attendance: { groupBy: jest.fn().mockResolvedValue([]) },
    };
    schools = { findOneAccessibleOrThrow: jest.fn().mockResolvedValue(undefined) };
    service = new AttendanceService(
      prisma as unknown as PrismaService,
      schools as unknown as SchoolsService,
      {} as unknown as StudentsService,
      { record: jest.fn() } as unknown as AuditService,
      {} as unknown as DocumentsService,
    );
  });

  it("an Admin (no Teacher profile) gets school-wide rates, no section restriction", async () => {
    prisma.teacher.findFirst.mockResolvedValue(null);
    await service.attendanceRatesForSchool(ADMIN_ACTOR, "school-1", { academicYearId: "year-1" });
    const where = prisma.attendance.groupBy.mock.calls[0][0].where;
    expect(where.enrollment.sectionId).toBeUndefined();
    expect(prisma.teacherAssignment.findMany).not.toHaveBeenCalled();
  });

  // The bug this closes: attendanceRatesForSchool is reachable by anyone
  // with attendance.view — every Teacher, to view their own sections — but
  // classId/sectionId are optional filters, so a Teacher who omitted them
  // used to get rates for the WHOLE school instead of just their own
  // TeacherAssignment sections.
  it("a Teacher with no explicit sectionId is restricted to their own assigned sections only", async () => {
    prisma.teacher.findFirst.mockResolvedValue({ id: "teacher-1" });
    prisma.teacherAssignment.findMany.mockResolvedValue([{ sectionId: "sec-1" }, { sectionId: "sec-2" }]);

    await service.attendanceRatesForSchool(TEACHER_ACTOR, "school-1", { academicYearId: "year-1" });

    expect(prisma.teacherAssignment.findMany).toHaveBeenCalledWith({
      where: { teacherId: "teacher-1", schoolId: "school-1", academicYearId: "year-1" },
      select: { sectionId: true },
    });
    const where = prisma.attendance.groupBy.mock.calls[0][0].where;
    expect(where.enrollment.sectionId).toEqual({ in: ["sec-1", "sec-2"] });
  });

  it("rejects an explicit sectionId the teacher does not hold an assignment for", async () => {
    prisma.teacher.findFirst.mockResolvedValue({ id: "teacher-1" });
    prisma.teacherAssignment.findMany.mockResolvedValue([{ sectionId: "sec-1" }]);

    await expect(
      service.attendanceRatesForSchool(TEACHER_ACTOR, "school-1", { academicYearId: "year-1", sectionId: "someone-elses-section" }),
    ).rejects.toThrow("You are not assigned to this section");
    expect(prisma.attendance.groupBy).not.toHaveBeenCalled();
  });

  it("allows an explicit sectionId the teacher does hold an assignment for", async () => {
    prisma.teacher.findFirst.mockResolvedValue({ id: "teacher-1" });
    prisma.teacherAssignment.findMany.mockResolvedValue([{ sectionId: "sec-1" }, { sectionId: "sec-2" }]);

    await service.attendanceRatesForSchool(TEACHER_ACTOR, "school-1", { academicYearId: "year-1", sectionId: "sec-1" });

    const where = prisma.attendance.groupBy.mock.calls[0][0].where;
    expect(where.enrollment.sectionId).toBe("sec-1");
  });

  // Multi-school teacher: their assignments at a DIFFERENT school must
  // never leak into this school's rates — the TeacherAssignment lookup is
  // explicitly scoped by schoolId (asserted above), and academicYearId too,
  // so a stale/other-year assignment for this same section never widens
  // access either.
  it("scopes the teacher's own assignments to this school and this academic year only", async () => {
    prisma.teacher.findFirst.mockResolvedValue({ id: "teacher-1" });
    prisma.teacherAssignment.findMany.mockResolvedValue([{ sectionId: "sec-1" }]);

    await service.attendanceRatesForSchool(TEACHER_ACTOR, "school-1", { academicYearId: "year-1" });

    expect(prisma.teacherAssignment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { teacherId: "teacher-1", schoolId: "school-1", academicYearId: "year-1" } }),
    );
  });
});
