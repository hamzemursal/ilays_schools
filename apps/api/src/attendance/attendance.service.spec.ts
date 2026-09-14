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
  let prisma: { teacher: { findFirst: jest.Mock }; teacherAssignment: { findFirst: jest.Mock }; section: { findFirst: jest.Mock } };
  let schools: { findOneAccessibleOrThrow: jest.Mock };
  let service: AttendanceService;

  beforeEach(() => {
    prisma = {
      teacher: { findFirst: jest.fn().mockResolvedValue({ id: "teacher-profile-1" }) },
      teacherAssignment: { findFirst: jest.fn() },
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
    ).rejects.toThrow("You are not assigned to this section");
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
    ).rejects.toThrow("You are not assigned to this section");
    expect(prisma.teacher.findFirst).toHaveBeenCalledWith({ where: { userId: TEACHER_ACTOR.id } });
  });
});
