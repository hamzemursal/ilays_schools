import { BadRequestException, NotFoundException } from "@nestjs/common";
import type { AuthenticatedUser } from "../auth/types/authenticated-user";
import { PromotionsService } from "./promotions.service";
import { PrismaService } from "../prisma/prisma.service";
import { SchoolsService } from "../schools/schools.service";
import { ExamsService } from "../exams/exams.service";
import { AuditService } from "../audit/audit.service";
import type { PromoteSectionDto } from "./dto/promote-section.dto";

const ACTOR: AuthenticatedUser = {
  id: "admin-1",
  email: "admin@example.com",
  organizationId: "org-1",
  roles: ["SCHOOL_ADMIN"],
  permissions: ["promotions.execute"],
  schoolIds: ["school-1"],
};

const INCOMPLETE_RESULT = { term1Percentage: null, term2Percentage: null, annualPercentage: null, eligible: null };

type MockPrisma = {
  section: { findFirst: jest.Mock; findMany: jest.Mock; findUniqueOrThrow: jest.Mock };
  class: { findFirst: jest.Mock };
  academicYear: { findFirst: jest.Mock };
  studentEnrollment: { findMany: jest.Mock; count: jest.Mock; update: jest.Mock; create: jest.Mock; aggregate: jest.Mock };
  student: { update: jest.Mock };
  promotionBatch: { create: jest.Mock; findUniqueOrThrow: jest.Mock };
  promotionItem: { create: jest.Mock };
  $transaction: jest.Mock;
};

function createMockPrisma(): MockPrisma {
  const prisma: Partial<MockPrisma> = {
    section: { findFirst: jest.fn(), findMany: jest.fn(), findUniqueOrThrow: jest.fn() },
    class: { findFirst: jest.fn() },
    academicYear: { findFirst: jest.fn() },
    studentEnrollment: { findMany: jest.fn(), count: jest.fn(), update: jest.fn(), create: jest.fn(), aggregate: jest.fn() },
    student: { update: jest.fn() },
    promotionBatch: { create: jest.fn(), findUniqueOrThrow: jest.fn() },
    promotionItem: { create: jest.fn() },
  };
  prisma.$transaction = jest.fn((cb: (tx: unknown) => unknown) => cb(prisma));
  return prisma as MockPrisma;
}

function createService(prisma: MockPrisma) {
  const schools = { findOneAccessibleOrThrow: jest.fn().mockResolvedValue(undefined) };
  const exams = { getAnnualResult: jest.fn().mockResolvedValue(INCOMPLETE_RESULT) };
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  const service = new PromotionsService(
    prisma as unknown as PrismaService,
    schools as unknown as SchoolsService,
    exams as unknown as ExamsService,
    audit as unknown as AuditService,
  );
  return { service, schools, exams, audit };
}

// A Section belongs to a Class of a given level, inside a Division of a
// given type — resolvePlan's naturalOutcome depends on both of these, so
// each fixture spells them out explicitly rather than relying on defaults.
function section(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "section-1",
    name: "A",
    capacity: null,
    classId: "class-1",
    class: { id: "class-1", name: "Class 1", level: 1, divisionId: "division-1", division: { type: "PRIMARY" } },
    ...overrides,
  };
}

describe("PromotionsService.preview — per-student eligibility", () => {
  let prisma: MockPrisma;
  let service: PromotionsService;
  let exams: { getAnnualResult: jest.Mock };

  beforeEach(() => {
    prisma = createMockPrisma();
    ({ service, exams } = createService(prisma));
    prisma.section.findFirst.mockResolvedValue(section());
    prisma.class.findFirst.mockResolvedValue({ id: "class-2", name: "Class 2" });
    prisma.section.findMany.mockResolvedValue([]);
    prisma.studentEnrollment.count.mockResolvedValue(0);
  });

  it("throws NotFoundException when the section isn't in this school", async () => {
    prisma.section.findFirst.mockResolvedValue(null);
    await expect(service.preview(ACTOR, "school-1", "section-1", "year-1")).rejects.toThrow(NotFoundException);
  });

  it("suggests the section's natural outcome (PROMOTED) for an eligible student", async () => {
    prisma.studentEnrollment.findMany.mockResolvedValue([
      { id: "enr-1", studentId: "s1", rollNumber: 1, studentNumber: "STU-1", student: { firstName: "Ahmed", lastName: "Ali" } },
    ]);
    exams.getAnnualResult.mockResolvedValue({ term1Percentage: 60, term2Percentage: 70, annualPercentage: 65, eligible: true });

    const result = await service.preview(ACTOR, "school-1", "section-1", "year-1");

    expect(result.students[0]).toMatchObject({ annualPercentage: 65, eligible: true, suggestedOutcome: "PROMOTED" });
  });

  it("suggests RETAINED for an ineligible student, never the section's natural outcome", async () => {
    prisma.studentEnrollment.findMany.mockResolvedValue([
      { id: "enr-2", studentId: "s2", rollNumber: 2, studentNumber: "STU-2", student: { firstName: "Hassan", lastName: "Omar" } },
    ]);
    exams.getAnnualResult.mockResolvedValue({ term1Percentage: 45, term2Percentage: 40, annualPercentage: 42.5, eligible: false });

    const result = await service.preview(ACTOR, "school-1", "section-1", "year-1");

    expect(result.students[0]).toMatchObject({ annualPercentage: 42.5, eligible: false, suggestedOutcome: "RETAINED" });
  });

  it("suggests no outcome at all for an Incomplete student — never guesses", async () => {
    prisma.studentEnrollment.findMany.mockResolvedValue([
      { id: "enr-3", studentId: "s3", rollNumber: 3, studentNumber: "STU-3", student: { firstName: "Amina", lastName: "Yusuf" } },
    ]);
    exams.getAnnualResult.mockResolvedValue(INCOMPLETE_RESULT);

    const result = await service.preview(ACTOR, "school-1", "section-1", "year-1");

    expect(result.students[0]).toMatchObject({ eligible: null, suggestedOutcome: null });
  });

  it("returns both current-class and next-class sections with real capacity data, for RETAINED and PROMOTED destinations respectively", async () => {
    prisma.studentEnrollment.findMany.mockResolvedValue([]);
    prisma.section.findMany
      .mockResolvedValueOnce([{ id: "cur-a", name: "A", capacity: 30 }]) // currentClass sections
      .mockResolvedValueOnce([{ id: "next-b", name: "B", capacity: null }]); // nextClass sections
    prisma.studentEnrollment.count.mockResolvedValueOnce(20).mockResolvedValueOnce(5);

    const result = await service.preview(ACTOR, "school-1", "section-1", "year-1");

    expect(result.currentClassSections).toEqual([{ id: "cur-a", name: "A", capacity: 30, currentActive: 20, available: 10 }]);
    expect(result.nextClassSections).toEqual([{ id: "next-b", name: "B", capacity: null, currentActive: 5, available: null }]);
  });

  it("is read-only — never writes anything or records an audit entry", async () => {
    prisma.studentEnrollment.findMany.mockResolvedValue([]);
    const { service: freshService, audit } = createService(prisma);
    await freshService.preview(ACTOR, "school-1", "section-1", "year-1");
    expect(prisma.promotionBatch.create).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });
});

describe("PromotionsService.confirm — structural validation", () => {
  let prisma: MockPrisma;
  let service: PromotionsService;

  beforeEach(() => {
    prisma = createMockPrisma();
    ({ service } = createService(prisma));
    prisma.section.findFirst.mockResolvedValue(section());
    prisma.class.findFirst.mockResolvedValue({ id: "class-2", name: "Class 2" });
    prisma.academicYear.findFirst.mockResolvedValue({ id: "year-2", name: "2028" });
    prisma.studentEnrollment.findMany.mockResolvedValue([
      { id: "enr-1", studentId: "student-1", organizationId: "org-1", studentNumber: "STU-1" },
    ]);
    // currentClass sections + nextClass sections, in that lookup order
    prisma.section.findMany
      .mockResolvedValueOnce([{ id: "cur-a", name: "A" }])
      .mockResolvedValueOnce([{ id: "next-b", name: "B" }]);
    prisma.section.findUniqueOrThrow.mockResolvedValue({ id: "next-b", name: "B", capacity: null });
    prisma.studentEnrollment.count.mockResolvedValue(0);
    prisma.studentEnrollment.aggregate.mockResolvedValue({ _max: { rollNumber: null } });
    prisma.studentEnrollment.create.mockResolvedValue({ id: "new-enr-1" });
    prisma.promotionBatch.create.mockResolvedValue({ id: "batch-1" });
    prisma.promotionBatch.findUniqueOrThrow.mockResolvedValue({ id: "batch-1", items: [] });
  });

  function dto(overrides: Partial<PromoteSectionDto> = {}): PromoteSectionDto {
    return {
      fromAcademicYearId: "year-1",
      toAcademicYearId: "year-2",
      assignments: [{ enrollmentId: "enr-1", outcome: "PROMOTED", targetSectionId: "next-b" }],
      ...overrides,
    };
  }

  it("rejects an academic year not belonging to this school", async () => {
    prisma.academicYear.findFirst.mockResolvedValue(null);
    await expect(service.confirm(ACTOR, "school-1", "section-1", dto())).rejects.toThrow(
      "That academic year does not belong to this school",
    );
  });

  it("rejects an empty assignments array", async () => {
    await expect(service.confirm(ACTOR, "school-1", "section-1", dto({ assignments: [] }))).rejects.toThrow(
      "At least one student assignment is required",
    );
  });

  it("rejects the same enrollment appearing twice", async () => {
    await expect(
      service.confirm(
        ACTOR,
        "school-1",
        "section-1",
        dto({
          assignments: [
            { enrollmentId: "enr-1", outcome: "PROMOTED", targetSectionId: "next-b" },
            { enrollmentId: "enr-1", outcome: "RETAINED", targetSectionId: "cur-a" },
          ],
        }),
      ),
    ).rejects.toThrow("The same enrollment can't be assigned twice");
  });

  it("rejects an enrollment that isn't an active student in this section/year", async () => {
    prisma.studentEnrollment.findMany.mockResolvedValue([]);
    await expect(service.confirm(ACTOR, "school-1", "section-1", dto())).rejects.toThrow(
      "One or more enrollments are not active students in this section for that academic year",
    );
  });

  it("rejects PROMOTED with no targetSectionId", async () => {
    await expect(
      service.confirm(
        ACTOR,
        "school-1",
        "section-1",
        dto({ assignments: [{ enrollmentId: "enr-1", outcome: "PROMOTED" }] }),
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it("rejects PROMOTED targeting a section that isn't in the next class", async () => {
    await expect(
      service.confirm(
        ACTOR,
        "school-1",
        "section-1",
        dto({ assignments: [{ enrollmentId: "enr-1", outcome: "PROMOTED", targetSectionId: "cur-a" }] }),
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it("rejects RETAINED targeting a section that isn't in the current class", async () => {
    await expect(
      service.confirm(
        ACTOR,
        "school-1",
        "section-1",
        dto({ assignments: [{ enrollmentId: "enr-1", outcome: "RETAINED", targetSectionId: "next-b" }] }),
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it("rejects PROMOTED when there is no next class at all", async () => {
    prisma.class.findFirst.mockResolvedValue(null);
    await expect(service.confirm(ACTOR, "school-1", "section-1", dto())).rejects.toThrow(
      "There is no next class to promote into",
    );
  });

  it("rejects when the target section can't fit everyone assigned to it", async () => {
    prisma.section.findUniqueOrThrow.mockResolvedValue({ id: "next-b", name: "B", capacity: 1 });
    prisma.studentEnrollment.findMany.mockResolvedValue([
      { id: "enr-1", studentId: "s1", organizationId: "org-1", studentNumber: "STU-1" },
      { id: "enr-2", studentId: "s2", organizationId: "org-1", studentNumber: "STU-2" },
    ]);
    await expect(
      service.confirm(
        ACTOR,
        "school-1",
        "section-1",
        dto({
          assignments: [
            { enrollmentId: "enr-1", outcome: "PROMOTED", targetSectionId: "next-b" },
            { enrollmentId: "enr-2", outcome: "PROMOTED", targetSectionId: "next-b" },
          ],
        }),
      ),
    ).rejects.toThrow(/doesn't have room for 2 more student/);
  });
});

describe("PromotionsService.confirm — PROMOTED outcome", () => {
  let prisma: MockPrisma;
  let service: PromotionsService;

  beforeEach(() => {
    prisma = createMockPrisma();
    ({ service } = createService(prisma));
    prisma.section.findFirst.mockResolvedValue(section());
    prisma.class.findFirst.mockResolvedValue({ id: "class-2", name: "Class 2" });
    prisma.academicYear.findFirst.mockResolvedValue({ id: "year-2", name: "2028" });
    prisma.studentEnrollment.findMany.mockResolvedValue([
      { id: "enr-1", studentId: "student-1", organizationId: "org-1", studentNumber: "STU-1" },
    ]);
    prisma.section.findMany.mockResolvedValueOnce([{ id: "cur-a" }]).mockResolvedValueOnce([{ id: "target-section-1" }]);
    prisma.section.findUniqueOrThrow.mockResolvedValue({ id: "target-section-1", name: "B", capacity: null });
    prisma.studentEnrollment.count.mockResolvedValue(0);
    prisma.studentEnrollment.aggregate.mockResolvedValue({ _max: { rollNumber: null } });
    prisma.studentEnrollment.create.mockResolvedValue({ id: "new-enr-1" });
    prisma.promotionBatch.create.mockResolvedValue({ id: "batch-1" });
    prisma.promotionBatch.findUniqueOrThrow.mockResolvedValue({ id: "batch-1", items: [] });
  });

  function dto(): PromoteSectionDto {
    return {
      fromAcademicYearId: "year-1",
      toAcademicYearId: "year-2",
      assignments: [{ enrollmentId: "enr-1", outcome: "PROMOTED", targetSectionId: "target-section-1" }],
    };
  }

  it("closes the old enrollment with status PROMOTED and creates a new ACTIVE one, carrying studentNumber forward unchanged", async () => {
    await service.confirm(ACTOR, "school-1", "section-1", dto());

    expect(prisma.studentEnrollment.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "enr-1" }, data: expect.objectContaining({ status: "PROMOTED" }) }),
    );
    expect(prisma.studentEnrollment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ studentNumber: "STU-1", status: "ACTIVE", sectionId: "target-section-1", classId: "class-2" }),
      }),
    );
  });

  it("records a PromotionItem with the new toEnrollmentId", async () => {
    await service.confirm(ACTOR, "school-1", "section-1", dto());

    expect(prisma.promotionItem.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ fromEnrollmentId: "enr-1", toEnrollmentId: "new-enr-1", outcome: "PROMOTED" }),
      }),
    );
  });

  it("records the audit entry under the PROMOTIONS module with PROMOTION_CONFIRMED", async () => {
    const { service: freshService, audit } = createService(prisma);
    await freshService.confirm(ACTOR, "school-1", "section-1", dto());

    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: "PROMOTION_CONFIRMED", module: "Promotions" }),
      prisma,
    );
  });
});

describe("PromotionsService.confirm — RETAINED outcome", () => {
  let prisma: MockPrisma;
  let service: PromotionsService;

  beforeEach(() => {
    prisma = createMockPrisma();
    ({ service } = createService(prisma));
    prisma.section.findFirst.mockResolvedValue(section());
    prisma.class.findFirst.mockResolvedValue({ id: "class-2", name: "Class 2" });
    prisma.academicYear.findFirst.mockResolvedValue({ id: "year-2", name: "2028" });
    prisma.studentEnrollment.findMany.mockResolvedValue([
      { id: "enr-2", studentId: "student-2", organizationId: "org-1", studentNumber: "STU-2" },
    ]);
    prisma.section.findMany.mockResolvedValueOnce([{ id: "cur-b" }]).mockResolvedValueOnce([{ id: "next-x" }]);
    prisma.section.findUniqueOrThrow.mockResolvedValue({ id: "cur-b", name: "B", capacity: null });
    prisma.studentEnrollment.count.mockResolvedValue(0);
    prisma.studentEnrollment.aggregate.mockResolvedValue({ _max: { rollNumber: null } });
    prisma.studentEnrollment.create.mockResolvedValue({ id: "new-enr-2" });
    prisma.promotionBatch.create.mockResolvedValue({ id: "batch-1" });
    prisma.promotionBatch.findUniqueOrThrow.mockResolvedValue({ id: "batch-1", items: [] });
  });

  function dto(): PromoteSectionDto {
    return {
      fromAcademicYearId: "year-1",
      toAcademicYearId: "year-2",
      assignments: [{ enrollmentId: "enr-2", outcome: "RETAINED", targetSectionId: "cur-b" }],
    };
  }

  it("creates the new enrollment in the CURRENT class (Class 1 -> Class 1), never the next class", async () => {
    await service.confirm(ACTOR, "school-1", "section-1", dto());

    expect(prisma.studentEnrollment.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ classId: "class-1", sectionId: "cur-b", status: "ACTIVE" }) }),
    );
  });

  it("closes the old enrollment with status RETAINED, never PROMOTED", async () => {
    await service.confirm(ACTOR, "school-1", "section-1", dto());

    expect(prisma.studentEnrollment.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "enr-2" }, data: expect.objectContaining({ status: "RETAINED" }) }),
    );
  });

  it("records a PromotionItem with outcome RETAINED and the new toEnrollmentId", async () => {
    await service.confirm(ACTOR, "school-1", "section-1", dto());

    expect(prisma.promotionItem.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ outcome: "RETAINED", toEnrollmentId: "new-enr-2" }) }),
    );
  });

  it("records a dedicated STUDENT_RETAINED audit entry, distinct from PROMOTION_CONFIRMED", async () => {
    const { service: freshService, audit } = createService(prisma);
    await freshService.confirm(ACTOR, "school-1", "section-1", dto());

    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: "STUDENT_RETAINED", module: "Promotions" }),
      prisma,
    );
  });

  it("never carries the old roll number forward — a fresh roll is assigned in the new (same) class", async () => {
    prisma.studentEnrollment.aggregate.mockResolvedValue({ _max: { rollNumber: 26 } });
    await service.confirm(ACTOR, "school-1", "section-1", dto());

    expect(prisma.studentEnrollment.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ rollNumber: 27 }) }),
    );
  });
});

describe("PromotionsService.confirm — mixed PROMOTED + RETAINED in one batch", () => {
  let prisma: MockPrisma;
  let service: PromotionsService;

  beforeEach(() => {
    prisma = createMockPrisma();
    ({ service } = createService(prisma));
    prisma.section.findFirst.mockResolvedValue(section());
    prisma.class.findFirst.mockResolvedValue({ id: "class-2", name: "Class 2" });
    prisma.academicYear.findFirst.mockResolvedValue({ id: "year-2", name: "2028" });
    prisma.studentEnrollment.findMany.mockResolvedValue([
      { id: "enr-1", studentId: "student-1", organizationId: "org-1", studentNumber: "STU-1" },
      { id: "enr-2", studentId: "student-2", organizationId: "org-1", studentNumber: "STU-2" },
    ]);
    prisma.section.findMany.mockResolvedValueOnce([{ id: "cur-a" }]).mockResolvedValueOnce([{ id: "next-b" }]);
    prisma.section.findUniqueOrThrow.mockImplementation(({ where }: { where: { id: string } }) =>
      Promise.resolve({ id: where.id, name: where.id, capacity: null }),
    );
    prisma.studentEnrollment.count.mockResolvedValue(0);
    prisma.studentEnrollment.aggregate.mockResolvedValue({ _max: { rollNumber: null } });
    prisma.studentEnrollment.create.mockImplementation(({ data }: { data: { sectionId: string } }) =>
      Promise.resolve({ id: `new-${data.sectionId}` }),
    );
    prisma.promotionBatch.create.mockResolvedValue({ id: "batch-1" });
    prisma.promotionBatch.findUniqueOrThrow.mockResolvedValue({ id: "batch-1", items: [] });
  });

  it("one student promoted and one retained in the same confirm call each get their own correct enrollment", async () => {
    await service.confirm(ACTOR, "school-1", "section-1", {
      fromAcademicYearId: "year-1",
      toAcademicYearId: "year-2",
      assignments: [
        { enrollmentId: "enr-1", outcome: "PROMOTED", targetSectionId: "next-b" },
        { enrollmentId: "enr-2", outcome: "RETAINED", targetSectionId: "cur-a" },
      ],
    });

    expect(prisma.studentEnrollment.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ classId: "class-2", sectionId: "next-b" }) }),
    );
    expect(prisma.studentEnrollment.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ classId: "class-1", sectionId: "cur-a" }) }),
    );
  });

  it("records BOTH a PROMOTION_CONFIRMED entry and a STUDENT_RETAINED entry, each with the correct count", async () => {
    const { service: freshService, audit } = createService(prisma);
    await freshService.confirm(ACTOR, "school-1", "section-1", {
      fromAcademicYearId: "year-1",
      toAcademicYearId: "year-2",
      assignments: [
        { enrollmentId: "enr-1", outcome: "PROMOTED", targetSectionId: "next-b" },
        { enrollmentId: "enr-2", outcome: "RETAINED", targetSectionId: "cur-a" },
      ],
    });

    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: "PROMOTION_CONFIRMED", after: expect.objectContaining({ studentCount: 1 }) }),
      prisma,
    );
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: "STUDENT_RETAINED", after: expect.objectContaining({ studentCount: 1 }) }),
      prisma,
    );
  });
});

describe("PromotionsService.confirm — COMPLETED/GRADUATED outcomes (no next class)", () => {
  let prisma: MockPrisma;

  beforeEach(() => {
    prisma = createMockPrisma();
    prisma.academicYear.findFirst.mockResolvedValue({ id: "year-2", name: "2028" });
    prisma.studentEnrollment.findMany.mockResolvedValue([
      { id: "enr-1", studentId: "student-1", organizationId: "org-1", studentNumber: "STU-1" },
    ]);
    prisma.section.findMany.mockResolvedValueOnce([{ id: "cur-a" }]).mockResolvedValueOnce([]);
    prisma.promotionBatch.create.mockResolvedValue({ id: "batch-1" });
    prisma.promotionBatch.findUniqueOrThrow.mockResolvedValue({ id: "batch-1", items: [] });
    prisma.class.findFirst.mockResolvedValue(null); // no next class — always the COMPLETED/GRADUATED path
  });

  function dto(): PromoteSectionDto {
    return {
      fromAcademicYearId: "year-1",
      toAcademicYearId: "year-2",
      assignments: [{ enrollmentId: "enr-1", outcome: "COMPLETED" }],
    };
  }

  it("COMPLETED: never requires a targetSectionId, closes the enrollment as COMPLETED, and sets currentStatus without creating a new enrollment", async () => {
    prisma.section.findFirst.mockResolvedValue(section()); // PRIMARY division
    const { service } = createService(prisma);

    await service.confirm(ACTOR, "school-1", "section-1", dto());

    expect(prisma.studentEnrollment.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "COMPLETED" }) }),
    );
    expect(prisma.student.update).toHaveBeenCalledWith({ where: { id: "student-1" }, data: { currentStatus: "COMPLETED" } });
    expect(prisma.studentEnrollment.create).not.toHaveBeenCalled();
    expect(prisma.promotionItem.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ toEnrollmentId: null, outcome: "COMPLETED" }) }),
    );
  });

  it("GRADUATED: closes the enrollment as GRADUATED and sets currentStatus to GRADUATED, under the STUDENT_LIFECYCLE audit module", async () => {
    prisma.section.findFirst.mockResolvedValue(
      section({ class: { id: "class-1", name: "Form 4", level: 4, divisionId: "division-2", division: { type: "SECONDARY" } } }),
    );
    const { service, audit } = createService(prisma);

    await service.confirm(ACTOR, "school-1", "section-1", {
      fromAcademicYearId: "year-1",
      toAcademicYearId: "year-2",
      assignments: [{ enrollmentId: "enr-1", outcome: "GRADUATED" }],
    });

    expect(prisma.student.update).toHaveBeenCalledWith({ where: { id: "student-1" }, data: { currentStatus: "GRADUATED" } });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: "SECONDARY_GRADUATION", module: "Student Lifecycle" }),
      prisma,
    );
  });
});
