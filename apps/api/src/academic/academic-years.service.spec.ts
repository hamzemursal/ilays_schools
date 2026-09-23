import { NotFoundException } from "@nestjs/common";
import type { AuthenticatedUser } from "../auth/types/authenticated-user";
import { AcademicYearsService } from "./academic-years.service";
import { PrismaService } from "../prisma/prisma.service";
import { SchoolsService } from "../schools/schools.service";
import { AuditService } from "../audit/audit.service";

const ACTOR: AuthenticatedUser = {
  id: "user-1",
  email: "admin@example.com",
  organizationId: "org-1",
  roles: ["SCHOOL_ADMIN"],
  permissions: ["academic.view"],
  schoolIds: ["school-1"],
};

const YEAR_2027 = { id: "year-real-id", name: "2027", schoolId: "school-1" };

describe("AcademicYearsService.resolveIdentifierOrThrow", () => {
  let prisma: { academicYear: { findFirst: jest.Mock } };
  let schools: { findOneAccessibleOrThrow: jest.Mock };
  let service: AcademicYearsService;

  beforeEach(() => {
    prisma = { academicYear: { findFirst: jest.fn() } };
    schools = { findOneAccessibleOrThrow: jest.fn().mockResolvedValue(undefined) };
    service = new AcademicYearsService(
      prisma as unknown as PrismaService,
      schools as unknown as SchoolsService,
      {} as unknown as AuditService,
    );
  });

  it("resolves a real id directly", async () => {
    prisma.academicYear.findFirst.mockResolvedValue(YEAR_2027);

    const result = await service.resolveIdentifierOrThrow(ACTOR, "school-1", "year-real-id");

    expect(schools.findOneAccessibleOrThrow).toHaveBeenCalledWith(ACTOR, "school-1");
    expect(result).toBe(YEAR_2027);
  });

  it("falls back to a name match (e.g. \"2027\") scoped to the given school", async () => {
    prisma.academicYear.findFirst.mockImplementation((args) =>
      Promise.resolve(args.where.id ? null : YEAR_2027),
    );

    const result = await service.resolveIdentifierOrThrow(ACTOR, "school-1", "2027");

    expect(result).toBe(YEAR_2027);
    expect(prisma.academicYear.findFirst).toHaveBeenLastCalledWith({
      where: { name: "2027", schoolId: "school-1" },
      include: { terms: { orderBy: { name: "asc" } } },
    });
  });

  it("throws NotFoundException when neither id nor name matches within this school", async () => {
    prisma.academicYear.findFirst.mockResolvedValue(null);

    await expect(service.resolveIdentifierOrThrow(ACTOR, "school-1", "1999")).rejects.toThrow(NotFoundException);
  });

  // Regression: this resolver's Prisma query previously omitted `terms`,
  // even though every caller (e.g. the Academic Year detail page's
  // TermWeightsEditor) receives this as an AcademicYear and calls
  // `year.terms.find(...)` on it — an undefined `terms` crashed the page
  // with "Cannot read properties of undefined (reading 'find')".
  it("includes terms in both the id and name lookups, matching list()'s own query shape", async () => {
    prisma.academicYear.findFirst.mockResolvedValue(YEAR_2027);
    await service.resolveIdentifierOrThrow(ACTOR, "school-1", "year-real-id");
    expect(prisma.academicYear.findFirst).toHaveBeenCalledWith({
      where: { id: "year-real-id", schoolId: "school-1" },
      include: { terms: { orderBy: { name: "asc" } } },
    });

    prisma.academicYear.findFirst.mockReset();
    prisma.academicYear.findFirst.mockImplementation((args) =>
      Promise.resolve(args.where.id ? null : YEAR_2027),
    );
    await service.resolveIdentifierOrThrow(ACTOR, "school-1", "2027");
    expect(prisma.academicYear.findFirst).toHaveBeenLastCalledWith({
      where: { name: "2027", schoolId: "school-1" },
      include: { terms: { orderBy: { name: "asc" } } },
    });
  });
});

// An Academic Year always has exactly Term 1 and Term 2 — there is
// deliberately no "create term" endpoint (see Term's schema comment), so
// this is the only place terms ever come into existence.
describe("AcademicYearsService.create — exactly two terms, always", () => {
  function createMockPrisma() {
    return {
      academicYear: {
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        create: jest.fn().mockResolvedValue({ id: "year-1" }),
        findUniqueOrThrow: jest.fn(),
        findFirst: jest.fn(),
      },
      term: { createMany: jest.fn().mockResolvedValue({ count: 2 }), findMany: jest.fn(), update: jest.fn() },
      $transaction: jest.fn(),
    };
  }

  function createService(prisma: ReturnType<typeof createMockPrisma>) {
    const schools = { findOneAccessibleOrThrow: jest.fn().mockResolvedValue(undefined) };
    prisma.academicYear.findUniqueOrThrow.mockImplementation(() =>
      Promise.resolve({
        id: "year-1",
        name: "2027",
        terms: [
          { id: "term-1", name: "Term 1", weight: 50 },
          { id: "term-2", name: "Term 2", weight: 50 },
        ],
      }),
    );
    prisma.academicYear.create.mockImplementation((args) => ({ id: "year-1", ...args.data }));
    prisma.$transaction = jest.fn((cb: (tx: unknown) => unknown) => cb(prisma));
    const service = new AcademicYearsService(prisma as unknown as PrismaService, schools as unknown as SchoolsService, {} as unknown as AuditService);
    return { service };
  }

  it("creates Term 1 (50%) and Term 2 (50%) in the same transaction as the year itself", async () => {
    const prisma = createMockPrisma();
    const { service } = createService(prisma);

    await service.create(ACTOR, "school-1", { name: "2027", startDate: "2027-01-01", endDate: "2027-12-31" });

    expect(prisma.term.createMany).toHaveBeenCalledWith({
      data: [
        { academicYearId: "year-1", name: "Term 1", weight: 50 },
        { academicYearId: "year-1", name: "Term 2", weight: 50 },
      ],
    });
  });

  it("returns the year with its two terms included", async () => {
    const prisma = createMockPrisma();
    const { service } = createService(prisma);

    const result = await service.create(ACTOR, "school-1", { name: "2027", startDate: "2027-01-01", endDate: "2027-12-31" });

    expect(result.terms).toEqual([
      { id: "term-1", name: "Term 1", weight: 50 },
      { id: "term-2", name: "Term 2", weight: 50 },
    ]);
  });
});

describe("AcademicYearsService.updateTermWeights", () => {
  function createMockPrisma() {
    return {
      academicYear: { findFirst: jest.fn().mockResolvedValue({ id: "year-1", schoolId: "school-1" }), findUniqueOrThrow: jest.fn() },
      term: { findMany: jest.fn(), update: jest.fn() },
      $transaction: jest.fn(),
    };
  }

  function createService(prisma: ReturnType<typeof createMockPrisma>) {
    const schools = { findOneAccessibleOrThrow: jest.fn().mockResolvedValue(undefined) };
    prisma.$transaction = jest.fn((cb: (tx: unknown) => unknown) => cb(prisma));
    const service = new AcademicYearsService(prisma as unknown as PrismaService, schools as unknown as SchoolsService, {} as unknown as AuditService);
    return { service };
  }

  it("accepts weights that sum to exactly 100 (e.g. 40/60)", async () => {
    const prisma = createMockPrisma();
    prisma.term.findMany.mockResolvedValue([
      { id: "term-1", name: "Term 1" },
      { id: "term-2", name: "Term 2" },
    ]);
    prisma.academicYear.findUniqueOrThrow.mockResolvedValue({ id: "year-1", terms: [] });
    const { service } = createService(prisma);

    await service.updateTermWeights(ACTOR, "school-1", "year-1", { term1Weight: 40, term2Weight: 60 });

    expect(prisma.term.update).toHaveBeenCalledWith({ where: { id: "term-1" }, data: { weight: 40 } });
    expect(prisma.term.update).toHaveBeenCalledWith({ where: { id: "term-2" }, data: { weight: 60 } });
  });

  it("rejects weights that don't sum to 100", async () => {
    const prisma = createMockPrisma();
    const { service } = createService(prisma);

    await expect(
      service.updateTermWeights(ACTOR, "school-1", "year-1", { term1Weight: 40, term2Weight: 50 }),
    ).rejects.toThrow("Term 1 and Term 2 weights must sum to exactly 100");
    expect(prisma.term.update).not.toHaveBeenCalled();
  });

  it("rejects 50/50 changed to 60/60 (over 100) just as clearly as under 100", async () => {
    const prisma = createMockPrisma();
    const { service } = createService(prisma);

    await expect(
      service.updateTermWeights(ACTOR, "school-1", "year-1", { term1Weight: 60, term2Weight: 60 }),
    ).rejects.toThrow("Term 1 and Term 2 weights must sum to exactly 100");
  });
});

// Phase 1: an Academic Year has EXACTLY Term 1 and Term 2 — there is no Term
// 3, no Mid-Term term, and no way to add or remove one.
describe("Academic Year terms — exactly two, never more", () => {
  it("year creation produces precisely Term 1 and Term 2 (no third term, whatever the Exam Types are)", async () => {
    const term = { createMany: jest.fn().mockResolvedValue({ count: 2 }) };
    const prisma = {
      academicYear: {
        updateMany: jest.fn(),
        create: jest.fn().mockResolvedValue({ id: "year-1" }),
        findUniqueOrThrow: jest.fn().mockResolvedValue({ id: "year-1", terms: [] }),
      },
      term,
      $transaction: jest.fn(),
    };
    prisma.$transaction = jest.fn((cb: (tx: unknown) => unknown) => cb(prisma));
    const schools = { findOneAccessibleOrThrow: jest.fn().mockResolvedValue(undefined) };
    const service = new AcademicYearsService(prisma as unknown as PrismaService, schools as unknown as SchoolsService, {} as unknown as AuditService);

    await service.create(ACTOR, "school-1", { name: "2026-2027", startDate: "2026-09-01", endDate: "2027-06-30" });

    const rows = term.createMany.mock.calls[0][0].data as Array<{ name: string; weight: number }>;
    expect(rows.map((r) => r.name)).toEqual(["Term 1", "Term 2"]);
    expect(rows.reduce((sum, r) => sum + r.weight, 0)).toBe(100);
    expect(term.createMany).toHaveBeenCalledTimes(1);
  });

  it("the service exposes no way to create or delete a term — only to re-weight the existing two", () => {
    const service = new AcademicYearsService({} as unknown as PrismaService, {} as unknown as SchoolsService, {} as unknown as AuditService);
    const methods = Object.getOwnPropertyNames(Object.getPrototypeOf(service));

    expect(methods.filter((m) => /term/i.test(m))).toEqual(["updateTermWeights"]);
  });
});
