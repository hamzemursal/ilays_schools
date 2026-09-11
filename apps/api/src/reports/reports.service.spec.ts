import type { AuthenticatedUser } from "../auth/types/authenticated-user";
import { ReportsService } from "./reports.service";
import { PrismaService } from "../prisma/prisma.service";
import { SchoolsService } from "../schools/schools.service";

const ACTOR: AuthenticatedUser = {
  id: "admin-1",
  email: "admin@example.com",
  organizationId: "org-1",
  roles: ["SCHOOL_ADMIN"],
  permissions: ["reports.view"],
  schoolIds: ["school-1"],
};

type MockPrisma = {
  class: { findMany: jest.Mock };
  section: { findMany: jest.Mock };
  attendance: { groupBy: jest.Mock };
  studentEnrollment: { findMany: jest.Mock };
};

function createMockPrisma(): MockPrisma {
  return {
    class: { findMany: jest.fn() },
    section: { findMany: jest.fn() },
    attendance: { groupBy: jest.fn() },
    studentEnrollment: { findMany: jest.fn() },
  };
}

function createService(prisma: MockPrisma) {
  const schools = { findOneAccessibleOrThrow: jest.fn().mockResolvedValue(undefined) };
  const service = new ReportsService(prisma as unknown as PrismaService, schools as unknown as SchoolsService);
  return { service, schools };
}

describe("ReportsService.enrollmentByClass", () => {
  let prisma: MockPrisma;
  let service: ReportsService;

  beforeEach(() => {
    prisma = createMockPrisma();
    ({ service } = createService(prisma));
  });

  it("checks school access before querying", async () => {
    prisma.class.findMany.mockResolvedValue([]);
    const { service: svc, schools } = createService(prisma);
    await svc.enrollmentByClass(ACTOR, "school-1", "year-1");
    expect(schools.findOneAccessibleOrThrow).toHaveBeenCalledWith(ACTOR, "school-1");
  });

  it("scopes the enrollment count to the given academic year and ACTIVE status only", async () => {
    prisma.class.findMany.mockResolvedValue([]);
    await service.enrollmentByClass(ACTOR, "school-1", "year-1");

    const args = prisma.class.findMany.mock.calls[0][0];
    expect(args.where).toEqual({ division: { schoolId: "school-1" } });
    expect(args.include.sections.include._count.select.enrollments.where).toEqual({ academicYearId: "year-1", status: "ACTIVE" });
  });

  it("rolls each class's totalEnrolled up from its own sections' counts", async () => {
    prisma.class.findMany.mockResolvedValue([
      {
        id: "class-1",
        name: "Class 1",
        sections: [
          { id: "sec-a", name: "A", _count: { enrollments: 20 } },
          { id: "sec-b", name: "B", _count: { enrollments: 18 } },
        ],
      },
    ]);

    const result = await service.enrollmentByClass(ACTOR, "school-1", "year-1");

    expect(result).toEqual([
      {
        classId: "class-1",
        className: "Class 1",
        sections: [
          { sectionId: "sec-a", sectionName: "A", enrolled: 20 },
          { sectionId: "sec-b", sectionName: "B", enrolled: 18 },
        ],
        totalEnrolled: 38,
      },
    ]);
  });

  it("returns totalEnrolled 0 for a class with no sections", async () => {
    prisma.class.findMany.mockResolvedValue([{ id: "class-1", name: "Class 1", sections: [] }]);
    const result = await service.enrollmentByClass(ACTOR, "school-1", "year-1");
    expect(result[0].totalEnrolled).toBe(0);
  });
});

describe("ReportsService.attendanceByClass", () => {
  let prisma: MockPrisma;
  let service: ReportsService;

  beforeEach(() => {
    prisma = createMockPrisma();
    ({ service } = createService(prisma));
    prisma.section.findMany.mockResolvedValue([{ id: "sec-a", name: "A", class: { name: "Class 1" } }]);
  });

  it("checks school access before querying", async () => {
    prisma.attendance.groupBy.mockResolvedValue([]);
    prisma.studentEnrollment.findMany.mockResolvedValue([]);
    const { service: svc, schools } = createService(prisma);
    prisma.section.findMany.mockResolvedValue([]);
    await svc.attendanceByClass(ACTOR, "school-1", "year-1");
    expect(schools.findOneAccessibleOrThrow).toHaveBeenCalledWith(ACTOR, "school-1");
  });

  it("omits the date filter entirely when neither from nor to is given", async () => {
    prisma.attendance.groupBy.mockResolvedValue([]);
    prisma.studentEnrollment.findMany.mockResolvedValue([]);

    await service.attendanceByClass(ACTOR, "school-1", "year-1");

    const args = prisma.attendance.groupBy.mock.calls[0][0];
    expect(args.where).not.toHaveProperty("date");
  });

  it("builds a half-open date range when only 'from' is given", async () => {
    prisma.attendance.groupBy.mockResolvedValue([]);
    prisma.studentEnrollment.findMany.mockResolvedValue([]);

    await service.attendanceByClass(ACTOR, "school-1", "year-1", "2028-01-01");

    const args = prisma.attendance.groupBy.mock.calls[0][0];
    expect(args.where.date).toEqual({ gte: new Date("2028-01-01") });
  });

  it("builds a closed date range when both from and to are given", async () => {
    prisma.attendance.groupBy.mockResolvedValue([]);
    prisma.studentEnrollment.findMany.mockResolvedValue([]);

    await service.attendanceByClass(ACTOR, "school-1", "year-1", "2028-01-01", "2028-01-31");

    const args = prisma.attendance.groupBy.mock.calls[0][0];
    expect(args.where.date).toEqual({ gte: new Date("2028-01-01"), lte: new Date("2028-01-31") });
  });

  it("rolls attendance counts up to the correct section via the enrollment->section map, splitting by status", async () => {
    prisma.section.findMany.mockResolvedValue([
      { id: "sec-a", name: "A", class: { name: "Class 1" } },
      { id: "sec-b", name: "B", class: { name: "Class 1" } },
    ]);
    prisma.attendance.groupBy.mockResolvedValue([
      { status: "PRESENT", enrollmentId: "enr-1", _count: 18 },
      { status: "ABSENT", enrollmentId: "enr-1", _count: 2 },
      { status: "LATE", enrollmentId: "enr-2", _count: 3 },
      { status: "EXCUSED", enrollmentId: "enr-2", _count: 1 },
    ]);
    prisma.studentEnrollment.findMany.mockResolvedValue([
      { id: "enr-1", sectionId: "sec-a" },
      { id: "enr-2", sectionId: "sec-b" },
    ]);

    const result = await service.attendanceByClass(ACTOR, "school-1", "year-1");

    expect(result).toEqual([
      { sectionId: "sec-a", sectionName: "A", className: "Class 1", total: 20, present: 18, absent: 2, late: 0, excused: 0 },
      { sectionId: "sec-b", sectionName: "B", className: "Class 1", total: 4, present: 0, absent: 0, late: 3, excused: 1 },
    ]);
  });

  it("returns every section in the school with all-zero counts when there's no attendance data at all", async () => {
    prisma.attendance.groupBy.mockResolvedValue([]);
    prisma.studentEnrollment.findMany.mockResolvedValue([]);

    const result = await service.attendanceByClass(ACTOR, "school-1", "year-1");

    expect(result).toEqual([{ sectionId: "sec-a", sectionName: "A", className: "Class 1", total: 0, present: 0, absent: 0, late: 0, excused: 0 }]);
  });

  it("silently drops a group whose enrollment can't be resolved to a section, rather than throwing", async () => {
    prisma.attendance.groupBy.mockResolvedValue([{ status: "PRESENT", enrollmentId: "orphan-enr", _count: 5 }]);
    prisma.studentEnrollment.findMany.mockResolvedValue([]); // orphan-enr not found

    const result = await service.attendanceByClass(ACTOR, "school-1", "year-1");

    expect(result).toEqual([{ sectionId: "sec-a", sectionName: "A", className: "Class 1", total: 0, present: 0, absent: 0, late: 0, excused: 0 }]);
  });
});
