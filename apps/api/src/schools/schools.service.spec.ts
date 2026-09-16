import { NotFoundException } from "@nestjs/common";
import type { AuthenticatedUser } from "../auth/types/authenticated-user";
import { SchoolsService } from "./schools.service";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";

function actorFor(organizationId: string | null, schoolIds: string[]): AuthenticatedUser {
  return {
    id: "user-1",
    email: "admin@example.com",
    organizationId,
    roles: ["SCHOOL_ADMIN"],
    permissions: ["academic.view"],
    schoolIds,
  };
}

const SCHOOL_A = { id: "school-a-id", organizationId: "org-1", name: "Xaafuun" };
const SCHOOL_B = { id: "school-b-id", organizationId: "org-1", name: "Ilays Academy College" };

describe("SchoolsService.resolveIdentifierOrThrow", () => {
  let prisma: { school: { findFirst: jest.Mock; findMany: jest.Mock } };
  let service: SchoolsService;

  beforeEach(() => {
    prisma = { school: { findFirst: jest.fn(), findMany: jest.fn() } };
    service = new SchoolsService(prisma as unknown as PrismaService, {} as unknown as AuditService);
  });

  it("resolves a real id directly, without needing the slug fallback", async () => {
    prisma.school.findFirst.mockResolvedValue(SCHOOL_A);

    const result = await service.resolveIdentifierOrThrow(actorFor("org-1", ["school-a-id"]), "school-a-id");

    expect(result).toBe(SCHOOL_A);
    expect(prisma.school.findMany).not.toHaveBeenCalled();
  });

  it("falls back to a slug match derived from the school's name", async () => {
    prisma.school.findFirst.mockResolvedValue(null); // no id match
    prisma.school.findMany.mockResolvedValue([SCHOOL_A]); // this actor's accessible schools

    const result = await service.resolveIdentifierOrThrow(actorFor("org-1", ["school-a-id"]), "xaafuun");

    expect(result).toBe(SCHOOL_A);
  });

  // The core safety property: the slug fallback only ever searches within
  // whatever findMany already scoped to this actor — it cannot see a school
  // outside that set, no matter what slug is guessed.
  it("never resolves a slug belonging to a school outside the actor's accessible scope", async () => {
    prisma.school.findFirst.mockResolvedValue(null);
    // This actor only has school-a-id, so accessibleWhere's findMany would
    // never actually return SCHOOL_B — simulated here by returning only
    // what a correctly-scoped query would.
    prisma.school.findMany.mockResolvedValue([SCHOOL_A]);

    await expect(
      service.resolveIdentifierOrThrow(actorFor("org-1", ["school-a-id"]), "ilays-academy-college"),
    ).rejects.toThrow(NotFoundException);
  });

  it("throws NotFoundException for a slug that matches nothing at all", async () => {
    prisma.school.findFirst.mockResolvedValue(null);
    prisma.school.findMany.mockResolvedValue([SCHOOL_A]);

    await expect(
      service.resolveIdentifierOrThrow(actorFor("org-1", ["school-a-id"]), "does-not-exist"),
    ).rejects.toThrow(NotFoundException);
  });

  it("slug matching is case-insensitive", async () => {
    prisma.school.findFirst.mockResolvedValue(null);
    prisma.school.findMany.mockResolvedValue([SCHOOL_A]);

    const result = await service.resolveIdentifierOrThrow(actorFor("org-1", ["school-a-id"]), "XAAFUUN");

    expect(result).toBe(SCHOOL_A);
  });
});

// The actual security boundary behind the Schools page and the Super Admin
// dashboard: a school-scoped actor's query must never even ask for another
// school's rows, not just have them filtered out afterward.
describe("SchoolsService.findAccessible — organization-wide vs school-scoped actors", () => {
  function createMockPrisma() {
    return {
      school: { findMany: jest.fn() },
      studentEnrollment: { groupBy: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) },
      teacher: { groupBy: jest.fn().mockResolvedValue([]) },
      staff: { groupBy: jest.fn().mockResolvedValue([]) },
      role: { findUnique: jest.fn().mockResolvedValue(null) },
      userSchool: { findMany: jest.fn().mockResolvedValue([]) },
      guardian: { count: jest.fn().mockResolvedValue(0) },
      auditLog: { findMany: jest.fn().mockResolvedValue([]) },
      user: { findMany: jest.fn().mockResolvedValue([]) },
    };
  }

  it("restricts the query to the actor's own schoolIds when they have any (School Admin)", async () => {
    const prisma = createMockPrisma();
    prisma.school.findMany.mockResolvedValue([SCHOOL_A]);
    const service = new SchoolsService(prisma as unknown as PrismaService, {} as unknown as AuditService);

    await service.findAccessible(actorFor("org-1", ["school-a-id"]));

    expect(prisma.school.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { organizationId: "org-1", id: { in: ["school-a-id"] } } }),
    );
  });

  it("never restricts by id for an organization-wide actor (Super Admin) — every school in the org is queried", async () => {
    const prisma = createMockPrisma();
    prisma.school.findMany.mockResolvedValue([SCHOOL_A, SCHOOL_B]);
    const service = new SchoolsService(prisma as unknown as PrismaService, {} as unknown as AuditService);

    await service.findAccessible(actorFor("org-1", []));

    expect(prisma.school.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { organizationId: "org-1" } }));
  });

  it("computes real per-school student/teacher/staff counts from groupBy, not a hard-coded or shared number", async () => {
    const prisma = createMockPrisma();
    prisma.school.findMany.mockResolvedValue([SCHOOL_A, SCHOOL_B]);
    prisma.studentEnrollment.groupBy.mockResolvedValue([{ schoolId: "school-a-id", _count: { _all: 50 } }]);
    prisma.teacher.groupBy.mockResolvedValue([{ schoolId: "school-a-id", _count: { _all: 7 } }]);
    prisma.staff.groupBy.mockResolvedValue([{ schoolId: "school-b-id", _count: { _all: 3 } }]);
    const service = new SchoolsService(prisma as unknown as PrismaService, {} as unknown as AuditService);

    const result = await service.findAccessible(actorFor("org-1", []));

    const schoolA = result.find((s) => s.id === "school-a-id")!;
    const schoolB = result.find((s) => s.id === "school-b-id")!;
    expect(schoolA).toMatchObject({ studentCount: 50, teacherCount: 7, staffCount: 0 });
    expect(schoolB).toMatchObject({ studentCount: 0, teacherCount: 0, staffCount: 3 });
  });
});

describe("SchoolsService.getSystemSummary", () => {
  function createMockPrisma() {
    return {
      school: { findMany: jest.fn() },
      studentEnrollment: { groupBy: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) },
      teacher: { groupBy: jest.fn().mockResolvedValue([]) },
      staff: { groupBy: jest.fn().mockResolvedValue([]) },
      role: { findUnique: jest.fn().mockResolvedValue(null) },
      userSchool: { findMany: jest.fn().mockResolvedValue([]) },
      guardian: { count: jest.fn().mockResolvedValue(0) },
      auditLog: { findMany: jest.fn().mockResolvedValue([]) },
      user: { findMany: jest.fn().mockResolvedValue([]) },
    };
  }

  it("reports a real staff total (summed from the Staff model), not the teacher count relabeled", async () => {
    const prisma = createMockPrisma();
    prisma.school.findMany.mockResolvedValue([SCHOOL_A, SCHOOL_B]);
    prisma.teacher.groupBy.mockResolvedValue([{ schoolId: "school-a-id", _count: { _all: 10 } }]);
    prisma.staff.groupBy.mockResolvedValue([
      { schoolId: "school-a-id", _count: { _all: 4 } },
      { schoolId: "school-b-id", _count: { _all: 2 } },
    ]);
    const service = new SchoolsService(prisma as unknown as PrismaService, {} as unknown as AuditService);

    const summary = await service.getSystemSummary(actorFor("org-1", []));

    expect(summary.totals.teachers).toBe(10);
    expect(summary.totals.staff).toBe(6);
  });

  it("only totals the schools this actor can access — a School Admin never sees another school's numbers folded in", async () => {
    const prisma = createMockPrisma();
    prisma.school.findMany.mockResolvedValue([SCHOOL_A]); // accessibleWhere already scoped this
    prisma.studentEnrollment.groupBy.mockResolvedValue([{ schoolId: "school-a-id", _count: { _all: 20 } }]);
    const service = new SchoolsService(prisma as unknown as PrismaService, {} as unknown as AuditService);

    const summary = await service.getSystemSummary(actorFor("org-1", ["school-a-id"]));

    expect(summary.totals.schools).toBe(1);
    expect(summary.totals.students).toBe(20);
    expect(prisma.school.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { organizationId: "org-1", id: { in: ["school-a-id"] } } }),
    );
  });

  it("returns the per-school list alongside the totals, each carrying its own real counts", async () => {
    const prisma = createMockPrisma();
    prisma.school.findMany.mockResolvedValue([SCHOOL_A, SCHOOL_B]);
    prisma.studentEnrollment.groupBy.mockResolvedValue([{ schoolId: "school-a-id", _count: { _all: 680 } }]);
    prisma.teacher.groupBy.mockResolvedValue([{ schoolId: "school-a-id", _count: { _all: 48 } }]);
    prisma.staff.groupBy.mockResolvedValue([{ schoolId: "school-a-id", _count: { _all: 24 } }]);
    const service = new SchoolsService(prisma as unknown as PrismaService, {} as unknown as AuditService);

    const summary = await service.getSystemSummary(actorFor("org-1", []));

    const schoolA = summary.schools.find((s) => s.id === "school-a-id")!;
    expect(schoolA).toMatchObject({ studentCount: 680, teacherCount: 48, staffCount: 24 });
  });
});
