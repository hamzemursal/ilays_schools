import { BadRequestException, ConflictException, NotFoundException } from "@nestjs/common";
import { Prisma } from "@school-erp/database";
import type { AuthenticatedUser } from "../auth/types/authenticated-user";
import { ClassesService } from "./classes.service";
import { PrismaService } from "../prisma/prisma.service";
import { SchoolsService } from "../schools/schools.service";
import { AuditService } from "../audit/audit.service";
import type { BulkTransferClassDto } from "./dto/bulk-transfer-class.dto";

const ACTOR: AuthenticatedUser = {
  id: "user-1",
  email: "admin@example.com",
  organizationId: "org-1",
  roles: ["SCHOOL_ADMIN"],
  permissions: ["academic.manage"],
  schoolIds: ["school-1"],
};

// Two classes in different divisions (Primary vs Secondary) and two in the
// same division but different levels — everything bulkTransfer's class
// lookups need, keyed by id so the fake `class.findFirst` can answer either
// the source or the destination lookup correctly regardless of call order.
const CLASSES: Record<string, { id: string; name: string; divisionId: string; level: number; academicYearId: string | null }> = {
  "class-2-primary": { id: "class-2-primary", name: "Class 2", divisionId: "div-primary", level: 2, academicYearId: "year-1" },
  "class-8-primary": { id: "class-8-primary", name: "Class 8", divisionId: "div-primary", level: 8, academicYearId: "year-1" },
  "class-1-secondary": { id: "class-1-secondary", name: "Form 1", divisionId: "div-secondary", level: 1, academicYearId: "year-1" },
};

function baseDto(overrides: Partial<BulkTransferClassDto> = {}): BulkTransferClassDto {
  return {
    academicYearId: "year-1",
    toClassId: "class-8-primary",
    toSectionId: "section-b",
    ...overrides,
  };
}

describe("ClassesService.bulkTransfer", () => {
  let prisma: {
    class: { findFirst: jest.Mock };
    section: { findFirst: jest.Mock };
    academicYear: { findFirst: jest.Mock };
    studentEnrollment: { findMany: jest.Mock; aggregate: jest.Mock; count: jest.Mock; update: jest.Mock };
    classSubject: { findMany: jest.Mock };
    teacherAssignment: { findMany: jest.Mock };
    $transaction: jest.Mock;
  };
  let schools: { findOneAccessibleOrThrow: jest.Mock };
  let service: ClassesService;

  beforeEach(() => {
    prisma = {
      class: { findFirst: jest.fn((args) => Promise.resolve(CLASSES[args.where.id] ?? null)) },
      section: { findFirst: jest.fn() },
      academicYear: { findFirst: jest.fn() },
      studentEnrollment: { findMany: jest.fn(), aggregate: jest.fn(), count: jest.fn(), update: jest.fn() },
      classSubject: { findMany: jest.fn() },
      teacherAssignment: { findMany: jest.fn() },
      $transaction: jest.fn((cb) => cb(prisma)),
    };
    schools = { findOneAccessibleOrThrow: jest.fn().mockResolvedValue(undefined) };
    service = new ClassesService(
      prisma as unknown as PrismaService,
      schools as unknown as SchoolsService,
      { record: jest.fn() } as unknown as AuditService,
    );
  });

  it("rejects a transfer between different divisions (Primary -> Secondary)", async () => {
    prisma.academicYear.findFirst.mockResolvedValue({ id: "year-1", schoolId: "school-1" });

    await expect(
      service.bulkTransfer(ACTOR, "school-1", "class-2-primary", baseDto({ toClassId: "class-1-secondary" })),
    ).rejects.toThrow(BadRequestException);
    await expect(
      service.bulkTransfer(ACTOR, "school-1", "class-2-primary", baseDto({ toClassId: "class-1-secondary" })),
    ).rejects.toThrow(/same division/i);

    // Fails before ever touching sections/enrollments — no partial work done.
    expect(prisma.section.findFirst).not.toHaveBeenCalled();
  });

  it("allows a transfer within the same division across different levels (Class 2 -> Class 8), and reports unassigned subjects", async () => {
    prisma.section.findFirst.mockResolvedValue({ id: "section-b", name: "B", capacity: null, classId: "class-8-primary" });
    prisma.academicYear.findFirst.mockResolvedValue({ id: "year-1", schoolId: "school-1" });
    prisma.studentEnrollment.findMany.mockResolvedValue([
      { id: "enr-1", studentId: "student-1", rollNumber: 1 },
    ]);
    prisma.studentEnrollment.aggregate.mockResolvedValue({ _max: { rollNumber: null }, _count: 0 });
    prisma.classSubject.findMany.mockResolvedValue([
      { subjectId: "subj-maths", subject: { name: "Maths" } },
      { subjectId: "subj-eng", subject: { name: "English" } },
    ]);
    // Only Maths has a teacher assigned in the destination section — English
    // is the gap this fix is meant to surface.
    prisma.teacherAssignment.findMany.mockResolvedValue([{ subjectId: "subj-maths" }]);

    const result = await service.bulkTransfer(ACTOR, "school-1", "class-2-primary", baseDto());

    expect(result).toEqual({
      success: true,
      movedCount: 1,
      unassignedSubjects: [{ subjectId: "subj-eng", subjectName: "English" }],
    });
  });
});

describe("ClassesService.resolveIdentifierOrThrow / resolveSectionIdentifierOrThrow", () => {
  let prisma: {
    class: { findFirst: jest.Mock; findMany: jest.Mock };
    section: { findFirst: jest.Mock };
    academicYear: { findFirst: jest.Mock };
  };
  let schools: { findOneAccessibleOrThrow: jest.Mock };
  let service: ClassesService;

  const SECONDARY_1 = { id: "class-real-id", name: "Form 1", level: 1, divisionId: "div-secondary", academicYearId: "year-1" };

  beforeEach(() => {
    prisma = { class: { findFirst: jest.fn(), findMany: jest.fn() }, section: { findFirst: jest.fn() }, academicYear: { findFirst: jest.fn() } };
    schools = { findOneAccessibleOrThrow: jest.fn().mockResolvedValue(undefined) };
    service = new ClassesService(
      prisma as unknown as PrismaService,
      schools as unknown as SchoolsService,
      {} as unknown as AuditService,
    );
  });

  it("resolves a real class id directly, checking school access first", async () => {
    prisma.class.findFirst.mockResolvedValue(SECONDARY_1);

    const result = await service.resolveIdentifierOrThrow(ACTOR, "school-1", "class-real-id");

    expect(schools.findOneAccessibleOrThrow).toHaveBeenCalledWith(ACTOR, "school-1");
    expect(result).toBe(SECONDARY_1);
  });

  // A slug "{division}-{level}" no longer names ONE class: every academic year
  // has its own. It is resolved through a year (current by default).
  const yearOf = (id: string, isCurrent: boolean, start: string) => ({ id, isCurrent, startDate: new Date(start) });
  const slugClass = (id: string, academicYearId: string | null, year: ReturnType<typeof yearOf> | null) => ({
    id,
    name: "Form 3",
    level: 3,
    divisionId: "div-secondary",
    academicYearId,
    academicYear: year,
  });
  const Y25 = yearOf("year-25", true, "2025-08-01");
  const Y26 = yearOf("year-26", false, "2026-08-01");

  beforeEach(() => {
    prisma.class.findFirst.mockResolvedValue(null); // by-id lookup misses
  });

  it("resolves a slug to the CURRENT year's class when several years have a class of that level", async () => {
    prisma.class.findMany.mockResolvedValue([slugClass("f3-26", "year-26", Y26), slugClass("f3-25", "year-25", Y25)]);

    const result = await service.resolveIdentifierOrThrow(ACTOR, "school-1", "secondary-3");

    expect(result.id).toBe("f3-25");
    expect(result).not.toHaveProperty("academicYear");
    expect(prisma.class.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { level: 3, division: { schoolId: "school-1", type: "SECONDARY" } } }),
    );
  });

  it("an explicit academicYearId picks THAT year's class", async () => {
    prisma.academicYear.findFirst.mockResolvedValue({ id: "year-26" });
    prisma.class.findMany.mockResolvedValue([slugClass("f3-26", "year-26", Y26), slugClass("f3-25", "year-25", Y25)]);

    const result = await service.resolveIdentifierOrThrow(ACTOR, "school-1", "secondary-3", "year-26");

    expect(result.id).toBe("f3-26");
  });

  it("an explicit year that does not belong to the school is refused", async () => {
    prisma.academicYear.findFirst.mockResolvedValue(null);

    await expect(service.resolveIdentifierOrThrow(ACTOR, "school-1", "secondary-3", "other-school-year")).rejects.toThrow(BadRequestException);
  });

  it("an explicit year with no class of that level is a 404 (never another year's class)", async () => {
    prisma.academicYear.findFirst.mockResolvedValue({ id: "year-27" });
    prisma.class.findMany.mockResolvedValue([slugClass("f3-26", "year-26", Y26), slugClass("f3-25", "year-25", Y25)]);

    await expect(service.resolveIdentifierOrThrow(ACTOR, "school-1", "secondary-3", "year-27")).rejects.toThrow(NotFoundException);
  });

  it("with no current-year class it falls back to the LATEST year that has one", async () => {
    const past = yearOf("year-24", false, "2024-08-01");
    prisma.class.findMany.mockResolvedValue([slugClass("f3-24", "year-24", past), slugClass("f3-26", "year-26", Y26)]);

    const result = await service.resolveIdentifierOrThrow(ACTOR, "school-1", "secondary-3");

    expect(result.id).toBe("f3-26");
  });

  it("a still-unstamped legacy class is used when there is no current-year class (before the backfill)", async () => {
    prisma.class.findMany.mockResolvedValue([slugClass("f3-legacy", null, null)]);

    const result = await service.resolveIdentifierOrThrow(ACTOR, "school-1", "secondary-3");

    expect(result.id).toBe("f3-legacy");
  });

  it("no class of that level at all is a 404", async () => {
    prisma.class.findMany.mockResolvedValue([]);

    await expect(service.resolveIdentifierOrThrow(ACTOR, "school-1", "secondary-3")).rejects.toThrow("Class not found in this school");
  });

  it("rejects a malformed class slug without querying the database for it", async () => {
    prisma.class.findFirst.mockResolvedValue(null);

    await expect(service.resolveIdentifierOrThrow(ACTOR, "school-1", "not-a-real-slug")).rejects.toThrow(
      "Class not found in this school",
    );
    // Only the by-id attempt should have run — a slug that doesn't even
    // parse never reaches a second query.
    expect(prisma.class.findFirst).toHaveBeenCalledTimes(1);
  });

  it("resolveSectionIdentifierOrThrow falls back to a case-insensitive name match within the given class", async () => {
    prisma.class.findFirst.mockResolvedValue(SECONDARY_1); // getClassInSchoolOrThrow
    prisma.section.findFirst.mockImplementation((args) => {
      if (args.where.id) return Promise.resolve(null);
      return Promise.resolve({ id: "section-real-id", name: "A", classId: "class-real-id" });
    });

    const result = await service.resolveSectionIdentifierOrThrow(ACTOR, "school-1", "class-real-id", "a");

    expect(result).toEqual({ id: "section-real-id", name: "A", classId: "class-real-id" });
  });
});

// Regression coverage for the historical-enrollment-scoping bug: requesting
// a specific (possibly past) academic year used to also require
// status: "ACTIVE", which is never true once a student has been
// promoted/retained out of that year — so every one of these counts/rosters
// silently read as empty for any year but the current one.
describe("ClassesService — historical Academic Year scoping (regression)", () => {
  let prisma: {
    class: { findFirst: jest.Mock; findMany: jest.Mock };
    section: { findFirst: jest.Mock; findMany: jest.Mock };
    academicYear: { findFirst: jest.Mock };
    studentEnrollment: { findMany: jest.Mock; count: jest.Mock };
  };
  let schools: { findOneAccessibleOrThrow: jest.Mock };
  let service: ClassesService;

  beforeEach(() => {
    prisma = {
      class: { findFirst: jest.fn(), findMany: jest.fn() },
      section: { findFirst: jest.fn(), findMany: jest.fn() },
      academicYear: { findFirst: jest.fn() },
      studentEnrollment: { findMany: jest.fn(), count: jest.fn() },
    };
    schools = { findOneAccessibleOrThrow: jest.fn().mockResolvedValue(undefined) };
    prisma.academicYear.findFirst.mockResolvedValue({ id: "year-2025", name: "2025" });
    service = new ClassesService(
      prisma as unknown as PrismaService,
      schools as unknown as SchoolsService,
      {} as unknown as AuditService,
    );
  });

  it("list(): a specific academic year's section count is scoped by year alone, never combined with status: ACTIVE", async () => {
    prisma.class.findMany.mockResolvedValue([]);

    await service.list(ACTOR, "school-1", "year-2025");

    const args = prisma.class.findMany.mock.calls[0][0];
    expect(args.include.sections.include._count.select.enrollments.where).toEqual({ academicYearId: "year-2025" });
  });

  it("list(): with no academic year given at all, still falls back to status: ACTIVE (current-year default unchanged)", async () => {
    prisma.class.findMany.mockResolvedValue([]);

    await service.list(ACTOR, "school-1");

    const args = prisma.class.findMany.mock.calls[0][0];
    expect(args.include.sections.include._count.select.enrollments.where).toEqual({ status: "ACTIVE" });
  });

  it("listSections(): same fix applied to the per-class sections view", async () => {
    prisma.class.findFirst.mockResolvedValue({ id: "class-1" });
    prisma.section.findMany.mockResolvedValue([]);

    await service.listSections(ACTOR, "school-1", "class-1", "year-2025");

    const args = prisma.section.findMany.mock.calls[0][0];
    expect(args.include._count.select.enrollments.where).toEqual({ academicYearId: "year-2025" });
  });

  it("listSectionStudents(): Test D-equivalent — returns a student's closed 2025–2026 roster row, not their current 2026–2027 one", async () => {
    prisma.class.findFirst.mockResolvedValue({ id: "class-1" });
    prisma.section.findFirst.mockResolvedValue({ id: "section-a", classId: "class-1" });
    const rows = [
      { id: "enr-2025", studentId: "student-1", sectionId: "section-a", academicYearId: "year-2025", status: "PROMOTED", rollNumber: 5, student: {} },
      { id: "enr-2026", studentId: "student-1", sectionId: "section-a", academicYearId: "year-2026", status: "ACTIVE", rollNumber: 12, student: {} },
    ];
    prisma.studentEnrollment.findMany.mockImplementation((args: { where: { sectionId: string; academicYearId?: string; status?: string } }) =>
      Promise.resolve(
        rows.filter(
          (r) =>
            r.sectionId === args.where.sectionId &&
            (args.where.academicYearId ? r.academicYearId === args.where.academicYearId : r.status === "ACTIVE"),
        ),
      ),
    );

    const historical = await service.listSectionStudents(ACTOR, "school-1", "class-1", "section-a", "year-2025");
    const current = await service.listSectionStudents(ACTOR, "school-1", "class-1", "section-a", "year-2026");

    expect(historical.map((s) => s.enrollmentId)).toEqual(["enr-2025"]);
    expect(current.map((s) => s.enrollmentId)).toEqual(["enr-2026"]);
  });

  it("getBulkTransferImpact(): the Class Transfer picker's student count reflects a past year's real (closed) enrollments, not zero", async () => {
    prisma.class.findFirst.mockResolvedValue({ id: "class-1", name: "Class 1", academicYearId: "year-2025" });
    prisma.academicYear.findFirst.mockResolvedValue({ id: "year-2025", name: "2025" });
    prisma.studentEnrollment.count.mockResolvedValue(1);

    const result = await service.getBulkTransferImpact(ACTOR, "school-1", "class-1", "year-2025");

    expect(result.studentCount).toBe(1);
    const args = prisma.studentEnrollment.count.mock.calls[0][0];
    expect(args.where).not.toHaveProperty("status");
    expect(args.where.academicYearId).toBe("year-2025");
  });
});


// -------------------------------------------------------------------------------
// Phase 5B-2: classes are academic-year scoped
// -------------------------------------------------------------------------------
describe("ClassesService — academic-year scoped classes (Phase 5B-2)", () => {
  type Mock = jest.Mock;
  let prisma: {
    division: { findFirst: Mock };
    academicYear: { findFirst: Mock };
    subject: { count: Mock };
    class: { findFirst: Mock; findMany: Mock; update: Mock };
    section: { findFirst: Mock; create: Mock; update: Mock; delete: Mock };
    classSubject: { upsert: Mock; deleteMany: Mock };
    $transaction: Mock;
  };
  let tx: { class: { create: Mock; findUniqueOrThrow: Mock }; section: { create: Mock }; classSubject: { create: Mock } };
  let schools: { findOneAccessibleOrThrow: Mock };
  let service: ClassesService;

  const YEAR_26 = { id: "year-26", name: "2026-2027", schoolId: "school-1" };
  const stamped = (over: Record<string, unknown> = {}) => ({ id: "class-f3-26", name: "Form 3", level: 3, divisionId: "div-1", academicYearId: "year-26", ...over });
  const unstamped = () => stamped({ academicYearId: null });

  beforeEach(() => {
    tx = {
      class: { create: jest.fn().mockResolvedValue({ id: "new-class" }), findUniqueOrThrow: jest.fn().mockResolvedValue({ id: "new-class" }) },
      section: { create: jest.fn() },
      classSubject: { create: jest.fn() },
    };
    prisma = {
      division: { findFirst: jest.fn().mockResolvedValue({ id: "div-1", schoolId: "school-1" }) },
      academicYear: { findFirst: jest.fn().mockResolvedValue(YEAR_26) },
      subject: { count: jest.fn().mockResolvedValue(0) },
      class: { findFirst: jest.fn().mockResolvedValue(stamped()), findMany: jest.fn().mockResolvedValue([]), update: jest.fn().mockResolvedValue({}) },
      section: { findFirst: jest.fn().mockResolvedValue({ id: "sec-1" }), create: jest.fn(), update: jest.fn(), delete: jest.fn() },
      classSubject: { upsert: jest.fn(), deleteMany: jest.fn() },
      $transaction: jest.fn((cb: (t: unknown) => unknown) => cb(tx)),
    };
    schools = { findOneAccessibleOrThrow: jest.fn().mockResolvedValue(undefined) };
    service = new ClassesService(prisma as unknown as PrismaService, schools as unknown as SchoolsService, { record: jest.fn() } as unknown as AuditService);
  });

  const createDto = (over: Record<string, unknown> = {}) => ({ divisionId: "div-1", academicYearId: "year-26", name: "Form 3", level: 3, ...over });

  describe("create()", () => {
    it("creates the class FOR the given academic year", async () => {
      await service.create(ACTOR, "school-1", createDto() as never);

      expect(prisma.academicYear.findFirst).toHaveBeenCalledWith({ where: { id: "year-26", schoolId: "school-1" } });
      expect(tx.class.create).toHaveBeenCalledWith({ data: { divisionId: "div-1", academicYearId: "year-26", name: "Form 3", level: 3 } });
    });

    it("refuses an academic year that does not belong to this school", async () => {
      prisma.academicYear.findFirst.mockResolvedValue(null);

      await expect(service.create(ACTOR, "school-1", createDto({ academicYearId: "other-school-year" }) as never)).rejects.toThrow(
        "That academic year does not belong to this school",
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it("a duplicate now means the same level in the SAME academic year, and the message names that year", async () => {
      prisma.$transaction.mockRejectedValue(new Prisma.PrismaClientKnownRequestError("dup", { code: "P2002", clientVersion: "x" }));

      const attempt = service.create(ACTOR, "school-1", createDto() as never);

      await expect(attempt).rejects.toThrow(ConflictException);
      await expect(attempt).rejects.toThrow("Form 3 (level 3) already exists for 2026-2027 in this division");
    });
  });

  describe("list()", () => {
    it("lists the CURRENT academic year's classes by default (plus still-unstamped legacy ones), never another year's", async () => {
      prisma.academicYear.findFirst.mockResolvedValue({ id: "year-25", name: "2025-2026" });

      await service.list(ACTOR, "school-1");

      expect(prisma.academicYear.findFirst).toHaveBeenCalledWith({ where: { schoolId: "school-1", isCurrent: true } });
      expect(prisma.class.findMany.mock.calls[0][0].where).toEqual({
        division: { schoolId: "school-1" },
        OR: [{ academicYearId: "year-25" }, { academicYearId: null }],
      });
    });

    it("lists the requested year's classes when a year is given", async () => {
      await service.list(ACTOR, "school-1", "year-26");

      expect(prisma.academicYear.findFirst).toHaveBeenCalledWith({ where: { id: "year-26", schoolId: "school-1" } });
      expect(prisma.class.findMany.mock.calls[0][0].where.OR).toEqual([{ academicYearId: "year-26" }, { academicYearId: null }]);
    });

    it("with no current year it uses the latest year", async () => {
      prisma.academicYear.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: "year-latest", name: "2027" });

      await service.list(ACTOR, "school-1");

      expect(prisma.academicYear.findFirst).toHaveBeenLastCalledWith({ where: { schoolId: "school-1" }, orderBy: { startDate: "desc" } });
      expect(prisma.class.findMany.mock.calls[0][0].where.OR).toEqual([{ academicYearId: "year-latest" }, { academicYearId: null }]);
    });

    it("a school with no academic year at all lists its classes unfiltered", async () => {
      prisma.academicYear.findFirst.mockResolvedValue(null);

      await service.list(ACTOR, "school-1");

      expect(prisma.class.findMany.mock.calls[0][0].where).toEqual({ division: { schoolId: "school-1" } });
    });
  });

  describe("update()", () => {
    it("never changes the academic year: only name / level / division are written", async () => {
      await service.update(ACTOR, "school-1", "class-f3-26", { name: "Form 3 Blue" });

      expect(prisma.class.update.mock.calls[0][0].data).toEqual({ divisionId: undefined, name: "Form 3 Blue", level: undefined });
      expect(prisma.class.update.mock.calls[0][0].data).not.toHaveProperty("academicYearId");
    });

    it("a level clash is reported as the same level in the same academic year", async () => {
      prisma.class.update.mockRejectedValue(new Prisma.PrismaClientKnownRequestError("dup", { code: "P2002", clientVersion: "x" }));

      await expect(service.update(ACTOR, "school-1", "class-f3-26", { level: 4 })).rejects.toThrow(
        "A class with level 4 already exists in this academic year for this division",
      );
    });
  });

  describe("unstamped (legacy) classes are refused for every write, but stay readable", () => {
    beforeEach(() => prisma.class.findFirst.mockResolvedValue(unstamped()));

    it.each([
      ["update", (s: ClassesService) => s.update(ACTOR, "school-1", "c", { name: "x" })],
      ["createSection", (s: ClassesService) => s.createSection(ACTOR, "school-1", "c", { name: "B" } as never)],
      ["updateSection", (s: ClassesService) => s.updateSection(ACTOR, "school-1", "c", "sec-1", { name: "B" } as never)],
      ["removeSection", (s: ClassesService) => s.removeSection(ACTOR, "school-1", "c", "sec-1")],
      ["assignSubject", (s: ClassesService) => s.assignSubject(ACTOR, "school-1", "c", { subjectId: "sub" } as never)],
      ["unassignSubject", (s: ClassesService) => s.unassignSubject(ACTOR, "school-1", "c", "sub")],
    ])("%s refuses with a clear message and writes nothing", async (_name, call) => {
      await expect(call(service)).rejects.toThrow(/has no academic year yet/);
      expect(prisma.class.update).not.toHaveBeenCalled();
      expect(prisma.section.create).not.toHaveBeenCalled();
      expect(prisma.section.update).not.toHaveBeenCalled();
      expect(prisma.section.delete).not.toHaveBeenCalled();
      expect(prisma.classSubject.upsert).not.toHaveBeenCalled();
      expect(prisma.classSubject.deleteMany).not.toHaveBeenCalled();
    });

    it("listing an unstamped class's sections still works (reads tolerate legacy classes)", async () => {
      const findMany = jest.fn().mockResolvedValue([]);
      (prisma as unknown as { section: { findMany: Mock } }).section.findMany = findMany;

      await expect(service.listSections(ACTOR, "school-1", "c")).resolves.toEqual([]);
    });
  });

  describe("bulkTransfer(): a same-year reorganization only", () => {
    it("refuses a source class that belongs to a different academic year than the selected one", async () => {
      prisma.class.findFirst.mockResolvedValue(stamped({ academicYearId: "year-25" }));
      prisma.academicYear.findFirst.mockResolvedValue({ id: "year-26", name: "2026-2027" });

      await expect(
        service.bulkTransfer(ACTOR, "school-1", "class-f3-26", { academicYearId: "year-26", toClassId: "x", toSectionId: "y" } as never),
      ).rejects.toThrow(/different academic year/);
    });

    it("refuses a destination class of another academic year", async () => {
      prisma.class.findFirst.mockImplementation((args: { where: { id: string } }) =>
        Promise.resolve(args.where.id === "class-f3-26" ? stamped() : stamped({ id: "class-f4-25", name: "Form 4", level: 4, academicYearId: "year-25" })),
      );
      prisma.academicYear.findFirst.mockResolvedValue({ id: "year-26", name: "2026-2027" });

      await expect(
        service.bulkTransfer(ACTOR, "school-1", "class-f3-26", { academicYearId: "year-26", toClassId: "class-f4-25", toSectionId: "y" } as never),
      ).rejects.toThrow(/Form 4 belongs to a different academic year/);
    });
  });
});
