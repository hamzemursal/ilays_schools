import type { AuthenticatedUser } from "../auth/types/authenticated-user";
import { DashboardService } from "./dashboard.service";
import { PrismaService } from "../prisma/prisma.service";
import { SchoolsService } from "../schools/schools.service";

const ACTOR: AuthenticatedUser = {
  id: "admin-1",
  email: "admin@example.com",
  organizationId: "org-1",
  roles: ["SCHOOL_ADMIN"],
  permissions: ["dashboard.view"],
  schoolIds: ["school-1"],
};

type MockPrisma = {
  academicYear: { findMany: jest.Mock };
  class: { count: jest.Mock };
  section: { count: jest.Mock };
  subject: { count: jest.Mock };
  teacher: { count: jest.Mock };
  studentEnrollment: { findMany: jest.Mock };
  teacherAssignment: { count: jest.Mock };
  attendance: { groupBy: jest.Mock };
  invoice: { findMany: jest.Mock };
};

function createMockPrisma(): MockPrisma {
  return {
    academicYear: { findMany: jest.fn().mockResolvedValue([]) },
    class: { count: jest.fn().mockResolvedValue(0) },
    section: { count: jest.fn().mockResolvedValue(0) },
    subject: { count: jest.fn().mockResolvedValue(0) },
    teacher: { count: jest.fn().mockResolvedValue(0) },
    studentEnrollment: { findMany: jest.fn().mockResolvedValue([]) },
    teacherAssignment: { count: jest.fn().mockResolvedValue(0) },
    attendance: { groupBy: jest.fn().mockResolvedValue([]) },
    invoice: { findMany: jest.fn().mockResolvedValue([]) },
  };
}

function createService(prisma: MockPrisma) {
  const schools = { findOneAccessibleOrThrow: jest.fn().mockResolvedValue(undefined) };
  const service = new DashboardService(prisma as unknown as PrismaService, schools as unknown as SchoolsService);
  return { service, schools };
}

describe("DashboardService.getSummary", () => {
  let prisma: MockPrisma;
  let service: DashboardService;

  beforeEach(() => {
    prisma = createMockPrisma();
    ({ service } = createService(prisma));
  });

  it("checks school access before querying", async () => {
    const { service: svc, schools } = createService(prisma);
    await svc.getSummary(ACTOR, "school-1");
    expect(schools.findOneAccessibleOrThrow).toHaveBeenCalledWith(ACTOR, "school-1");
  });

  it("returns academicYear: null and all-zero enrollment when the school has no academic years at all", async () => {
    const result = await service.getSummary(ACTOR, "school-1");
    expect(result.academicYear).toBeNull();
    expect(result.enrollment).toEqual({ total: 0, male: 0, female: 0 });
  });

  it("prefers the isCurrent year when no explicit academicYearId is given", async () => {
    prisma.academicYear.findMany.mockResolvedValue([
      { id: "year-1", name: "2027", isCurrent: false },
      { id: "year-2", name: "2028", isCurrent: true },
    ]);
    const result = await service.getSummary(ACTOR, "school-1");
    expect(result.academicYear).toEqual({ id: "year-2", name: "2028" });
  });

  it("falls back to the first year when none is marked current", async () => {
    prisma.academicYear.findMany.mockResolvedValue([
      { id: "year-1", name: "2027", isCurrent: false },
      { id: "year-2", name: "2028", isCurrent: false },
    ]);
    const result = await service.getSummary(ACTOR, "school-1");
    expect(result.academicYear).toEqual({ id: "year-1", name: "2027" });
  });

  it("resolves an explicit academicYearId over the current-year default", async () => {
    prisma.academicYear.findMany.mockResolvedValue([
      { id: "year-1", name: "2027", isCurrent: true },
      { id: "year-2", name: "2028", isCurrent: false },
    ]);
    const result = await service.getSummary(ACTOR, "school-1", "year-2");
    expect(result.academicYear).toEqual({ id: "year-2", name: "2028" });
  });

  it("counts enrollment by sex from ACTIVE enrollments in the resolved year", async () => {
    prisma.academicYear.findMany.mockResolvedValue([{ id: "year-1", name: "2028", isCurrent: true }]);
    prisma.studentEnrollment.findMany.mockResolvedValue([
      { student: { sex: "MALE" } },
      { student: { sex: "MALE" } },
      { student: { sex: "FEMALE" } },
    ]);

    const result = await service.getSummary(ACTOR, "school-1");

    expect(result.enrollment).toEqual({ total: 3, male: 2, female: 1 });
  });

  it("computes attendanceToday.percent as present/marked rounded, null when nothing is marked yet", async () => {
    const noneResult = await service.getSummary(ACTOR, "school-1");
    expect(noneResult.attendanceToday.percent).toBeNull();

    prisma.attendance.groupBy.mockResolvedValue([
      { status: "PRESENT", _count: 18 },
      { status: "ABSENT", _count: 2 },
    ]);
    const result = await service.getSummary(ACTOR, "school-1");
    expect(result.attendanceToday).toEqual({ marked: 20, present: 18, absent: 2, late: 0, excused: 0, percent: 90 });
  });

  it("sums outstandingFeesTotal as amount minus paid across UNPAID/PARTIALLY_PAID invoices", async () => {
    prisma.invoice.findMany.mockResolvedValue([
      { amount: "100.00", payments: [{ amount: "40.00" }] },
      { amount: "50.00", payments: [] },
    ]);

    const result = await service.getSummary(ACTOR, "school-1");

    expect(result.outstandingFeesTotal).toBe(110);
    expect(result.outstandingInvoiceCount).toBe(2);
  });

  it("scopes the outstanding-invoice query to UNPAID/PARTIALLY_PAID only", async () => {
    await service.getSummary(ACTOR, "school-1");
    expect(prisma.invoice.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { enrollment: { schoolId: "school-1" }, status: { in: ["UNPAID", "PARTIALLY_PAID"] } } }),
    );
  });

  it("computes setup.progressPercent from how many of the 6 setup flags are true", async () => {
    prisma.academicYear.findMany.mockResolvedValue([{ id: "year-1", name: "2028", isCurrent: true }]);
    prisma.class.count.mockResolvedValue(1);
    prisma.section.count.mockResolvedValue(1);
    prisma.subject.count.mockResolvedValue(1);
    // teacherAssignments and studentEnrollment both stay false (defaults) — 4 of 6 true

    const result = await service.getSummary(ACTOR, "school-1");

    expect(result.setup).toEqual({
      academicYear: true,
      classes: true,
      sections: true,
      subjects: true,
      teacherAssignments: false,
      studentEnrollment: false,
      progressPercent: 67,
    });
  });

  it("reports setup.progressPercent 100 when every flag is true", async () => {
    prisma.academicYear.findMany.mockResolvedValue([{ id: "year-1", name: "2028", isCurrent: true }]);
    prisma.class.count.mockResolvedValue(1);
    prisma.section.count.mockResolvedValue(1);
    prisma.subject.count.mockResolvedValue(1);
    prisma.studentEnrollment.findMany.mockResolvedValue([{ student: { sex: "MALE" } }]);
    prisma.teacherAssignment.count.mockResolvedValue(1);

    const result = await service.getSummary(ACTOR, "school-1");

    expect(result.setup.progressPercent).toBe(100);
  });

  it("reports teachers.active/inactive split and counts.teachers as their sum", async () => {
    prisma.teacher.count.mockResolvedValueOnce(5).mockResolvedValueOnce(2);
    const result = await service.getSummary(ACTOR, "school-1");
    expect(result.teachers).toEqual({ active: 5, inactive: 2 });
    expect(result.counts.teachers).toBe(7);
  });
});


describe("DashboardService.getSummary — class and section counts are for the selected year", () => {
  it("counts only the selected academic year's classes and sections", async () => {
    const prisma = createMockPrisma();
    prisma.academicYear.findMany.mockResolvedValue([{ id: "year-1", isCurrent: true }]);
    const { service } = createService(prisma);

    await service.getSummary(ACTOR, "school-1").catch(() => undefined);

    const classWhere = { division: { schoolId: "school-1" }, OR: [{ academicYearId: "year-1" }, { academicYearId: null }] };
    expect(prisma.class.count).toHaveBeenCalledWith({ where: classWhere });
    expect(prisma.section.count).toHaveBeenCalledWith({ where: { class: classWhere } });
  });
});
