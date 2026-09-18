import { BadRequestException } from "@nestjs/common";
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
const CLASSES: Record<string, { id: string; divisionId: string; level: number }> = {
  "class-2-primary": { id: "class-2-primary", divisionId: "div-primary", level: 2 },
  "class-8-primary": { id: "class-8-primary", divisionId: "div-primary", level: 8 },
  "class-1-secondary": { id: "class-1-secondary", divisionId: "div-secondary", level: 1 },
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
    class: { findFirst: jest.Mock };
    section: { findFirst: jest.Mock };
  };
  let schools: { findOneAccessibleOrThrow: jest.Mock };
  let service: ClassesService;

  const SECONDARY_1 = { id: "class-real-id", level: 1, divisionId: "div-secondary" };

  beforeEach(() => {
    prisma = { class: { findFirst: jest.fn() }, section: { findFirst: jest.fn() } };
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

  it("falls back to a (division, level) slug match, scoped to the given school", async () => {
    prisma.class.findFirst.mockImplementation((args) => {
      // First call: by-id lookup (misses). Second call: composite slug lookup.
      if (args.where.id) return Promise.resolve(null);
      return Promise.resolve(SECONDARY_1);
    });

    const result = await service.resolveIdentifierOrThrow(ACTOR, "school-1", "secondary-1");

    expect(result).toBe(SECONDARY_1);
    expect(prisma.class.findFirst).toHaveBeenLastCalledWith({
      where: { level: 1, division: { schoolId: "school-1", type: "SECONDARY" } },
    });
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
    prisma.class.findFirst.mockResolvedValue({ id: "class-1", name: "Class 1" });
    prisma.academicYear.findFirst.mockResolvedValue({ id: "year-2025", name: "2025" });
    prisma.studentEnrollment.count.mockResolvedValue(1);

    const result = await service.getBulkTransferImpact(ACTOR, "school-1", "class-1", "year-2025");

    expect(result.studentCount).toBe(1);
    const args = prisma.studentEnrollment.count.mock.calls[0][0];
    expect(args.where).not.toHaveProperty("status");
    expect(args.where.academicYearId).toBe("year-2025");
  });
});
