import { BadRequestException } from "@nestjs/common";
import type { AuthenticatedUser } from "../auth/types/authenticated-user";
import { PromotionsService } from "./promotions.service";
import { PrismaService } from "../prisma/prisma.service";
import { SchoolsService } from "../schools/schools.service";
import { ExamsService } from "../exams/exams.service";
import { AuditService } from "../audit/audit.service";
import type { PromoteSectionDto } from "./dto/promote-section.dto";

// Phase 1 — class progression, academic-year rules, retention, and history
// safety. The other spec file covers the per-student mechanics (capacity,
// audit grouping, structural validation); this one covers the school's rules.

const ACTOR: AuthenticatedUser = {
  id: "admin-1",
  email: "admin@example.com",
  organizationId: "org-1",
  roles: ["SCHOOL_ADMIN"],
  permissions: ["promotions.execute"],
  schoolIds: ["school-1"],
};

type MockPrisma = {
  section: { findFirst: jest.Mock; findMany: jest.Mock; findUniqueOrThrow: jest.Mock };
  class: { findFirst: jest.Mock };
  academicYear: { findFirst: jest.Mock; create: jest.Mock };
  studentEnrollment: {
    findMany: jest.Mock;
    count: jest.Mock;
    update: jest.Mock;
    create: jest.Mock;
    aggregate: jest.Mock;
    delete: jest.Mock;
    deleteMany: jest.Mock;
  };
  student: { update: jest.Mock };
  promotionBatch: { create: jest.Mock; findUniqueOrThrow: jest.Mock };
  promotionItem: { create: jest.Mock };
  $transaction: jest.Mock;
};

function createMockPrisma(): MockPrisma {
  const prisma: Partial<MockPrisma> = {
    section: { findFirst: jest.fn(), findMany: jest.fn(), findUniqueOrThrow: jest.fn() },
    class: { findFirst: jest.fn() },
    academicYear: { findFirst: jest.fn(), create: jest.fn() },
    studentEnrollment: {
      findMany: jest.fn(),
      count: jest.fn(),
      update: jest.fn(),
      create: jest.fn(),
      aggregate: jest.fn(),
      delete: jest.fn(),
      deleteMany: jest.fn(),
    },
    student: { update: jest.fn() },
    promotionBatch: { create: jest.fn(), findUniqueOrThrow: jest.fn() },
    promotionItem: { create: jest.fn() },
  };
  prisma.$transaction = jest.fn((cb: (tx: unknown) => unknown) => cb(prisma));
  return prisma as MockPrisma;
}

function createService(prisma: MockPrisma) {
  const schools = { findOneAccessibleOrThrow: jest.fn().mockResolvedValue(undefined) };
  const exams = {
    getAnnualResult: jest.fn().mockResolvedValue({ term1Percentage: null, term2Percentage: null, annualPercentage: null, eligible: null }),
  };
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  const service = new PromotionsService(
    prisma as unknown as PrismaService,
    schools as unknown as SchoolsService,
    exams as unknown as ExamsService,
    audit as unknown as AuditService,
  );
  return { service, exams, audit };
}

// year-1 is the year being promoted FROM, year-2 the already-created year
// being promoted TO — looked up by id, like the real query.
const YEAR_ROWS: Record<string, { id: string; name: string; startDate: Date }> = {
  "year-1": { id: "year-1", name: "2025-2026", startDate: new Date("2025-09-01") },
  "year-2": { id: "year-2", name: "2026-2027", startDate: new Date("2026-09-01") },
};
function mockYears(prisma: MockPrisma) {
  prisma.academicYear.findFirst.mockImplementation((args: { where: { id: string } }) => Promise.resolve(YEAR_ROWS[args.where.id] ?? null));
}

function classRow(name: string, level: number, type: "PRIMARY" | "SECONDARY") {
  return { id: `class-${name}`, name, level, divisionId: `div-${type}`, division: { type } };
}

function sectionRow(cls: ReturnType<typeof classRow>) {
  return { id: "section-1", name: "A", capacity: null, classId: cls.id, class: cls };
}

function arrangePreview(prisma: MockPrisma, cls: ReturnType<typeof classRow>, next: ReturnType<typeof classRow> | null) {
  prisma.section.findFirst.mockResolvedValue(sectionRow(cls));
  prisma.class.findFirst.mockResolvedValue(next);
  prisma.studentEnrollment.findMany.mockResolvedValue([]);
  prisma.section.findMany.mockResolvedValue([]);
  prisma.studentEnrollment.count.mockResolvedValue(0);
}

describe("PromotionsService — class progression (Form 1→4 then Graduate, Class 1→8 then Completion)", () => {
  let prisma: MockPrisma;
  let service: PromotionsService;

  beforeEach(() => {
    prisma = createMockPrisma();
    ({ service } = createService(prisma));
  });

  it.each([
    ["Form 1", 1, "Form 2", "SECONDARY"],
    ["Form 2", 2, "Form 3", "SECONDARY"],
    ["Form 3", 3, "Form 4", "SECONDARY"],
    ["Class 1", 1, "Class 2", "PRIMARY"],
    ["Class 7", 7, "Class 8", "PRIMARY"],
  ] as const)("%s → %s: promoted into the next class, never graduated or completed", async (name, level, nextName, type) => {
    arrangePreview(prisma, classRow(name, level, type), classRow(nextName, level + 1, type));

    const result = await service.preview(ACTOR, "school-1", "section-1", "year-1");

    expect(result.naturalOutcome).toBe("PROMOTED");
    expect(result.nextClass).toEqual({ id: `class-${nextName}`, name: nextName });
  });

  it("Form 4 (the Secondary final class) → Graduate/Alumni", async () => {
    arrangePreview(prisma, classRow("Form 4", 4, "SECONDARY"), null);

    const result = await service.preview(ACTOR, "school-1", "section-1", "year-1");

    expect(result.naturalOutcome).toBe("GRADUATED");
    expect(result.nextClass).toBeNull();
  });

  it("Class 8 (the Primary final class) → Primary Completion", async () => {
    arrangePreview(prisma, classRow("Class 8", 8, "PRIMARY"), null);

    const result = await service.preview(ACTOR, "school-1", "section-1", "year-1");

    expect(result.naturalOutcome).toBe("COMPLETED");
  });

  it("Form 2 must never graduate: with Form 3 not created yet, promotion is blocked with a clear message instead", async () => {
    arrangePreview(prisma, classRow("Form 2", 2, "SECONDARY"), null);

    await expect(service.preview(ACTOR, "school-1", "section-1", "year-1")).rejects.toThrow(
      "Form 2 can't be promoted yet — Form 3 has not been created in this school",
    );
  });

  it("Form 3 with no Form 4 created is blocked too — never treated as the last class", async () => {
    arrangePreview(prisma, classRow("Form 3", 3, "SECONDARY"), null);

    await expect(service.preview(ACTOR, "school-1", "section-1", "year-1")).rejects.toThrow(BadRequestException);
  });

  it("a Primary class other than Class 8 with no next class is blocked, never marked as Completion", async () => {
    arrangePreview(prisma, classRow("Class 3", 3, "PRIMARY"), null);

    await expect(service.preview(ACTOR, "school-1", "section-1", "year-1")).rejects.toThrow(
      "Class 3 can't be promoted yet — Class 4 has not been created in this school",
    );
  });

  it("confirm() enforces the same rule, so a client can't bypass the preview", async () => {
    mockYears(prisma);
    arrangePreview(prisma, classRow("Form 2", 2, "SECONDARY"), null);

    await expect(
      service.confirm(ACTOR, "school-1", "section-1", {
        fromAcademicYearId: "year-1",
        toAcademicYearId: "year-2",
        assignments: [{ enrollmentId: "enr-1", outcome: "GRADUATED" }],
      }),
    ).rejects.toThrow("Form 3 has not been created");
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("Form 4 stays the final class even if a stray level-5 class exists — still Graduate, next class never consulted", async () => {
    arrangePreview(prisma, classRow("Form 4", 4, "SECONDARY"), classRow("Form 5", 5, "SECONDARY"));

    const result = await service.preview(ACTOR, "school-1", "section-1", "year-1");

    expect(result.naturalOutcome).toBe("GRADUATED");
    expect(result.nextClass).toBeNull();
    expect(prisma.class.findFirst).not.toHaveBeenCalled();
  });
});

describe("PromotionsService.confirm — Phase 1 promotion rules", () => {
  let prisma: MockPrisma;
  let service: PromotionsService;
  let exams: { getAnnualResult: jest.Mock };
  let audit: { record: jest.Mock };

  function arrangeConfirm(cls: ReturnType<typeof classRow>, next: ReturnType<typeof classRow> | null) {
    mockYears(prisma);
    prisma.section.findFirst.mockResolvedValue(sectionRow(cls));
    prisma.class.findFirst.mockResolvedValue(next);
    prisma.studentEnrollment.findMany.mockResolvedValue([
      { id: "enr-1", studentId: "student-1", organizationId: "org-1", studentNumber: "STU-1" },
    ]);
    prisma.section.findMany.mockImplementation(({ where }: { where: { classId: string } }) =>
      Promise.resolve(where.classId === cls.id ? [{ id: "cur-a" }] : [{ id: "next-a" }]),
    );
    prisma.section.findUniqueOrThrow.mockImplementation(({ where }: { where: { id: string } }) =>
      Promise.resolve({ id: where.id, name: where.id, capacity: null }),
    );
    prisma.studentEnrollment.count.mockResolvedValue(0);
    prisma.studentEnrollment.aggregate.mockResolvedValue({ _max: { rollNumber: 6 } });
    prisma.studentEnrollment.create.mockResolvedValue({ id: "new-enr-1" });
    prisma.promotionBatch.create.mockResolvedValue({ id: "batch-1" });
    prisma.promotionBatch.findUniqueOrThrow.mockResolvedValue({ id: "batch-1", items: [] });
  }

  function dto(overrides: Partial<PromoteSectionDto> = {}): PromoteSectionDto {
    return {
      fromAcademicYearId: "year-1",
      toAcademicYearId: "year-2",
      assignments: [{ enrollmentId: "enr-1", outcome: "PROMOTED", targetSectionId: "next-a" }],
      ...overrides,
    };
  }

  const FORM_2 = () => classRow("Form 2", 2, "SECONDARY");
  const FORM_3 = () => classRow("Form 3", 3, "SECONDARY");

  beforeEach(() => {
    prisma = createMockPrisma();
    ({ service, exams, audit } = createService(prisma));
  });

  it("never creates the destination academic year — a missing one is an error telling the Admin to create it first", async () => {
    arrangeConfirm(FORM_2(), FORM_3());

    await expect(service.confirm(ACTOR, "school-1", "section-1", dto({ toAcademicYearId: "not-created-yet" }))).rejects.toThrow(
      "Create it first — Promotion never creates a new academic year",
    );

    expect(prisma.academicYear.create).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("a successful promotion also never touches academicYear.create", async () => {
    arrangeConfirm(FORM_2(), FORM_3());

    await service.confirm(ACTOR, "school-1", "section-1", dto());

    expect(prisma.academicYear.create).not.toHaveBeenCalled();
  });

  it("rejects promoting into the same year, or into an earlier one", async () => {
    arrangeConfirm(FORM_2(), FORM_3());

    await expect(service.confirm(ACTOR, "school-1", "section-1", dto({ toAcademicYearId: "year-1" }))).rejects.toThrow(
      "must be a later year",
    );
    await expect(
      service.confirm(ACTOR, "school-1", "section-1", dto({ fromAcademicYearId: "year-2", toAcademicYearId: "year-1" })),
    ).rejects.toThrow("must be a later year");
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("Form 2 → Form 3: an eligible student (65%) gets a NEW enrollment in the new year's Form 3; the old one is closed, not overwritten", async () => {
    arrangeConfirm(FORM_2(), FORM_3());
    exams.getAnnualResult.mockResolvedValue({ term1Percentage: 60, term2Percentage: 70, annualPercentage: 65, eligible: true });

    await service.confirm(ACTOR, "school-1", "section-1", dto());

    expect(prisma.studentEnrollment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        studentId: "student-1",
        studentNumber: "STU-1",
        academicYearId: "year-2",
        classId: "class-Form 3",
        sectionId: "next-a",
        rollNumber: 7,
        status: "ACTIVE",
      }),
    });
    expect(prisma.studentEnrollment.update).toHaveBeenCalledWith({
      where: { id: "enr-1" },
      data: { status: "PROMOTED", endDate: expect.any(Date) },
    });
  });

  it("Form 2 → Form 2: a retained student (43%) gets a NEW enrollment in the NEW year in the SAME class, with the same permanent student and a fresh roll number", async () => {
    arrangeConfirm(FORM_2(), FORM_3());
    exams.getAnnualResult.mockResolvedValue({ term1Percentage: 45, term2Percentage: 41, annualPercentage: 43, eligible: false });

    await service.confirm(
      ACTOR,
      "school-1",
      "section-1",
      dto({ assignments: [{ enrollmentId: "enr-1", outcome: "RETAINED", targetSectionId: "cur-a" }] }),
    );

    expect(prisma.studentEnrollment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        studentId: "student-1",
        studentNumber: "STU-1",
        academicYearId: "year-2",
        classId: "class-Form 2",
        sectionId: "cur-a",
        rollNumber: 7,
        status: "ACTIVE",
      }),
    });
    expect(prisma.studentEnrollment.update).toHaveBeenCalledWith({
      where: { id: "enr-1" },
      data: { status: "RETAINED", endDate: expect.any(Date) },
    });
    expect(prisma.student.update).not.toHaveBeenCalled();
  });

  it("a student below 50% can never be promoted, completed or graduated — only retained — whatever the client sends", async () => {
    arrangeConfirm(FORM_2(), FORM_3());
    exams.getAnnualResult.mockResolvedValue({ term1Percentage: 50, term2Percentage: 49.98, annualPercentage: 49.99, eligible: false });

    await expect(service.confirm(ACTOR, "school-1", "section-1", dto())).rejects.toThrow(
      "1 student(s) have an Annual Result below 50% and can only be retained",
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.studentEnrollment.create).not.toHaveBeenCalled();
  });

  it("a student at exactly 50.00% may be promoted", async () => {
    arrangeConfirm(FORM_2(), FORM_3());
    exams.getAnnualResult.mockResolvedValue({ term1Percentage: 50, term2Percentage: 50, annualPercentage: 50, eligible: true });

    await expect(service.confirm(ACTOR, "school-1", "section-1", dto())).resolves.toBeDefined();
  });

  it("a Form 2 student can never be sent as GRADUATED or COMPLETED — the class's only outcomes are Promoted or Retained", async () => {
    arrangeConfirm(FORM_2(), FORM_3());

    for (const outcome of ["GRADUATED", "COMPLETED"] as const) {
      await expect(
        service.confirm(ACTOR, "school-1", "section-1", dto({ assignments: [{ enrollmentId: "enr-1", outcome }] })),
      ).rejects.toThrow("Form 2 students can only be promoted or retained");
    }
    expect(prisma.student.update).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("Form 4 at 50%+ graduates: the enrollment closes as GRADUATED and no new enrollment is created", async () => {
    arrangeConfirm(classRow("Form 4", 4, "SECONDARY"), null);
    exams.getAnnualResult.mockResolvedValue({ term1Percentage: 60, term2Percentage: 60, annualPercentage: 60, eligible: true });

    await service.confirm(ACTOR, "school-1", "section-1", dto({ assignments: [{ enrollmentId: "enr-1", outcome: "GRADUATED" }] }));

    expect(prisma.studentEnrollment.update).toHaveBeenCalledWith({
      where: { id: "enr-1" },
      data: { status: "GRADUATED", endDate: expect.any(Date) },
    });
    expect(prisma.student.update).toHaveBeenCalledWith({ where: { id: "student-1" }, data: { currentStatus: "GRADUATED" } });
    expect(prisma.studentEnrollment.create).not.toHaveBeenCalled();
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: "SECONDARY_GRADUATION" }), prisma);
  });

  it("Class 8 at 50%+ completes Primary: closed as COMPLETED, no new enrollment", async () => {
    arrangeConfirm(classRow("Class 8", 8, "PRIMARY"), null);
    exams.getAnnualResult.mockResolvedValue({ term1Percentage: 55, term2Percentage: 55, annualPercentage: 55, eligible: true });

    await service.confirm(ACTOR, "school-1", "section-1", dto({ assignments: [{ enrollmentId: "enr-1", outcome: "COMPLETED" }] }));

    expect(prisma.studentEnrollment.update).toHaveBeenCalledWith({
      where: { id: "enr-1" },
      data: { status: "COMPLETED", endDate: expect.any(Date) },
    });
    expect(prisma.studentEnrollment.create).not.toHaveBeenCalled();
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: "PRIMARY_COMPLETION" }), prisma);
  });

  it("Form 4 below 50% cannot graduate — it is retained in Form 4 in the new year", async () => {
    arrangeConfirm(classRow("Form 4", 4, "SECONDARY"), null);
    exams.getAnnualResult.mockResolvedValue({ term1Percentage: 40, term2Percentage: 40, annualPercentage: 40, eligible: false });

    await expect(
      service.confirm(ACTOR, "school-1", "section-1", dto({ assignments: [{ enrollmentId: "enr-1", outcome: "GRADUATED" }] })),
    ).rejects.toThrow("below 50%");

    await service.confirm(
      ACTOR,
      "school-1",
      "section-1",
      dto({ assignments: [{ enrollmentId: "enr-1", outcome: "RETAINED", targetSectionId: "cur-a" }] }),
    );
    expect(prisma.studentEnrollment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ classId: "class-Form 4", academicYearId: "year-2", status: "ACTIVE" }),
    });
  });

  it("historical enrollment stays intact: the old row is only ever updated (status + endDate) — never deleted, moved to another year, or given a new student", async () => {
    arrangeConfirm(FORM_2(), FORM_3());

    await service.confirm(ACTOR, "school-1", "section-1", dto());

    expect(prisma.studentEnrollment.delete).not.toHaveBeenCalled();
    expect(prisma.studentEnrollment.deleteMany).not.toHaveBeenCalled();
    expect(prisma.studentEnrollment.update).toHaveBeenCalledTimes(1);
    const updateData = prisma.studentEnrollment.update.mock.calls[0][0].data;
    expect(Object.keys(updateData).sort()).toEqual(["endDate", "status"]);
    expect(prisma.student.update).not.toHaveBeenCalled();
    expect(prisma.promotionItem.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ fromEnrollmentId: "enr-1", toEnrollmentId: "new-enr-1", studentId: "student-1" }),
    });
  });
});
