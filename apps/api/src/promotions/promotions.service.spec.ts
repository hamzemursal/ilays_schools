import { BadRequestException, NotFoundException } from "@nestjs/common";
import type { AuthenticatedUser } from "../auth/types/authenticated-user";
import { PromotionsService } from "./promotions.service";
import { PrismaService } from "../prisma/prisma.service";
import { SchoolsService } from "../schools/schools.service";
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

type MockPrisma = {
  section: { findFirst: jest.Mock; findMany: jest.Mock };
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
    section: { findFirst: jest.fn(), findMany: jest.fn() },
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
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  const service = new PromotionsService(
    prisma as unknown as PrismaService,
    schools as unknown as SchoolsService,
    audit as unknown as AuditService,
  );
  return { service, schools, audit };
}

// A Section belongs to a Class of a given level, inside a Division of a
// given type — resolvePlan's outcome depends on both of these, so each
// fixture spells them out explicitly rather than relying on defaults.
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

describe("PromotionsService.preview — resolvePlan's outcome derivation", () => {
  let prisma: MockPrisma;
  let service: PromotionsService;

  beforeEach(() => {
    prisma = createMockPrisma();
    ({ service } = createService(prisma));
    prisma.studentEnrollment.findMany.mockResolvedValue([]);
  });

  it("throws NotFoundException when the section isn't in this school", async () => {
    prisma.section.findFirst.mockResolvedValue(null);
    await expect(service.preview(ACTOR, "school-1", "section-1", "year-1")).rejects.toThrow(NotFoundException);
  });

  it("outcome is PROMOTED when a next-level class exists in the same division", async () => {
    prisma.section.findFirst.mockResolvedValue(section());
    prisma.class.findFirst.mockResolvedValue({ id: "class-2", name: "Class 2" });
    prisma.section.findMany.mockResolvedValue([]);
    const result = await service.preview(ACTOR, "school-1", "section-1", "year-1");
    expect(result.outcome).toBe("PROMOTED");
    expect(result.nextClass).toEqual({ id: "class-2", name: "Class 2" });
  });

  it("outcome is COMPLETED when no next class exists and the division is PRIMARY", async () => {
    prisma.section.findFirst.mockResolvedValue(section());
    prisma.class.findFirst.mockResolvedValue(null);
    const result = await service.preview(ACTOR, "school-1", "section-1", "year-1");
    expect(result.outcome).toBe("COMPLETED");
    expect(result.nextClass).toBeNull();
    expect(result.targetSections).toEqual([]);
  });

  it("outcome is GRADUATED when no next class exists and the division is SECONDARY", async () => {
    prisma.section.findFirst.mockResolvedValue(
      section({ class: { id: "class-1", name: "Form 4", level: 4, divisionId: "division-2", division: { type: "SECONDARY" } } }),
    );
    prisma.class.findFirst.mockResolvedValue(null);
    const result = await service.preview(ACTOR, "school-1", "section-1", "year-1");
    expect(result.outcome).toBe("GRADUATED");
  });

  it("computes available capacity per target section, null when unlimited", async () => {
    prisma.section.findFirst.mockResolvedValue(section());
    prisma.class.findFirst.mockResolvedValue({ id: "class-2", name: "Class 2" });
    prisma.section.findMany.mockResolvedValue([
      { id: "sec-a", name: "A", capacity: 30 },
      { id: "sec-b", name: "B", capacity: null },
    ]);
    prisma.studentEnrollment.count.mockResolvedValueOnce(25).mockResolvedValueOnce(10);

    const result = await service.preview(ACTOR, "school-1", "section-1", "year-1");

    expect(result.targetSections).toEqual([
      { id: "sec-a", name: "A", capacity: 30, currentActive: 25, available: 5 },
      { id: "sec-b", name: "B", capacity: null, currentActive: 10, available: null },
    ]);
  });

  it("is read-only — never writes anything or records an audit entry", async () => {
    prisma.section.findFirst.mockResolvedValue(section());
    prisma.class.findFirst.mockResolvedValue(null);
    const { service: freshService, audit } = createService(prisma);
    await freshService.preview(ACTOR, "school-1", "section-1", "year-1");
    expect(prisma.promotionBatch.create).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
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
    prisma.studentEnrollment.count.mockResolvedValue(0);
    prisma.studentEnrollment.aggregate.mockResolvedValue({ _max: { rollNumber: null } });
    prisma.studentEnrollment.create.mockResolvedValue({ id: "new-enr-1" });
    prisma.promotionBatch.create.mockResolvedValue({ id: "batch-1" });
    prisma.promotionBatch.findUniqueOrThrow.mockResolvedValue({ id: "batch-1", items: [] });
  });

  function dto(overrides: Partial<PromoteSectionDto> = {}): PromoteSectionDto {
    return { fromAcademicYearId: "year-1", toAcademicYearId: "year-2", targetSectionId: "target-section-1", ...overrides };
  }

  it("rejects an academic year not belonging to this school", async () => {
    prisma.academicYear.findFirst.mockResolvedValue(null);
    await expect(service.confirm(ACTOR, "school-1", "section-1", dto())).rejects.toThrow(
      "That academic year does not belong to this school",
    );
  });

  it("rejects when there are no active students to promote", async () => {
    prisma.studentEnrollment.findMany.mockResolvedValue([]);
    await expect(service.confirm(ACTOR, "school-1", "section-1", dto())).rejects.toThrow(
      "No active students in this section for that academic year",
    );
  });

  it("requires targetSectionId when promoting to a next class", async () => {
    await expect(service.confirm(ACTOR, "school-1", "section-1", dto({ targetSectionId: undefined }))).rejects.toThrow(
      "targetSectionId is required when promoting to a next class",
    );
  });

  it("rejects a targetSectionId that doesn't belong to the next class", async () => {
    prisma.section.findFirst
      .mockResolvedValueOnce(section()) // resolvePlan's own section lookup
      .mockResolvedValueOnce(null); // the target-section lookup
    await expect(service.confirm(ACTOR, "school-1", "section-1", dto())).rejects.toThrow(
      "That section does not belong to the target class",
    );
  });

  it("rejects when the target section can't fit the whole cohort", async () => {
    prisma.section.findFirst
      .mockResolvedValueOnce(section())
      .mockResolvedValueOnce({ id: "target-section-1", name: "B", capacity: 1 });
    prisma.studentEnrollment.findMany.mockResolvedValue([
      { id: "enr-1", studentId: "s1", organizationId: "org-1", studentNumber: "STU-1" },
      { id: "enr-2", studentId: "s2", organizationId: "org-1", studentNumber: "STU-2" },
    ]);
    prisma.studentEnrollment.count.mockResolvedValue(0); // currently 0 active in target
    await expect(service.confirm(ACTOR, "school-1", "section-1", dto())).rejects.toThrow(
      "Target section B doesn't have room for 2 more student(s) (capacity 1, currently 0)",
    );
  });

  it("closes each old enrollment with status PROMOTED and creates a new ACTIVE one, carrying studentNumber forward unchanged", async () => {
    prisma.section.findFirst
      .mockResolvedValueOnce(section())
      .mockResolvedValueOnce({ id: "target-section-1", name: "B", capacity: null });

    await service.confirm(ACTOR, "school-1", "section-1", dto());

    expect(prisma.studentEnrollment.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "enr-1" }, data: expect.objectContaining({ status: "PROMOTED" }) }),
    );
    expect(prisma.studentEnrollment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ studentNumber: "STU-1", status: "ACTIVE", sectionId: "target-section-1" }),
      }),
    );
  });

  it("records a PromotionItem with the new toEnrollmentId for each promoted student", async () => {
    prisma.section.findFirst
      .mockResolvedValueOnce(section())
      .mockResolvedValueOnce({ id: "target-section-1", name: "B", capacity: null });

    await service.confirm(ACTOR, "school-1", "section-1", dto());

    expect(prisma.promotionItem.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ fromEnrollmentId: "enr-1", toEnrollmentId: "new-enr-1", outcome: "PROMOTED" }),
      }),
    );
  });

  it("records the audit entry under the PROMOTIONS module with PROMOTION_CONFIRMED", async () => {
    prisma.section.findFirst
      .mockResolvedValueOnce(section())
      .mockResolvedValueOnce({ id: "target-section-1", name: "B", capacity: null });
    const { service: freshService, audit } = createService(prisma);

    await freshService.confirm(ACTOR, "school-1", "section-1", dto());

    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: "PROMOTION_CONFIRMED", module: "Promotions" }),
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
    prisma.promotionBatch.create.mockResolvedValue({ id: "batch-1" });
    prisma.promotionBatch.findUniqueOrThrow.mockResolvedValue({ id: "batch-1", items: [] });
    prisma.class.findFirst.mockResolvedValue(null); // no next class — always the COMPLETED/GRADUATED path
  });

  function dto(): PromoteSectionDto {
    return { fromAcademicYearId: "year-1", toAcademicYearId: "year-2" };
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

    await service.confirm(ACTOR, "school-1", "section-1", dto());

    expect(prisma.student.update).toHaveBeenCalledWith({ where: { id: "student-1" }, data: { currentStatus: "GRADUATED" } });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: "SECONDARY_GRADUATION", module: "Student Lifecycle" }),
      prisma,
    );
  });
});
