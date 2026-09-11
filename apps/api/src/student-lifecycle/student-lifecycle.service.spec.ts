import { BadRequestException } from "@nestjs/common";
import type { AuthenticatedUser } from "../auth/types/authenticated-user";
import { StudentLifecycleService } from "./student-lifecycle.service";
import { PrismaService } from "../prisma/prisma.service";
import { SchoolsService } from "../schools/schools.service";
import { AuditService } from "../audit/audit.service";
import type { PreviewForm1TransitionDto } from "./dto/preview-form1-transition.dto";
import type { ConfirmForm1TransitionDto } from "./dto/confirm-form1-transition.dto";

const ACTOR: AuthenticatedUser = {
  id: "admin-1",
  email: "admin@example.com",
  organizationId: "org-1",
  roles: ["SCHOOL_ADMIN"],
  permissions: ["lifecycle.transition"],
  schoolIds: ["school-1"],
};

type MockPrisma = {
  class: { findFirst: jest.Mock };
  academicYear: { findFirst: jest.Mock };
  studentEnrollment: { findMany: jest.Mock; count: jest.Mock; aggregate: jest.Mock; create: jest.Mock };
  student: { update: jest.Mock };
  section: { findMany: jest.Mock };
  promotionBatch: { create: jest.Mock };
  promotionItem: { update: jest.Mock };
  $transaction: jest.Mock;
};

function createMockPrisma(): MockPrisma {
  const prisma: Partial<MockPrisma> = {
    class: { findFirst: jest.fn() },
    academicYear: { findFirst: jest.fn() },
    studentEnrollment: { findMany: jest.fn(), count: jest.fn(), aggregate: jest.fn(), create: jest.fn() },
    student: { update: jest.fn() },
    section: { findMany: jest.fn() },
    promotionBatch: { create: jest.fn() },
    promotionItem: { update: jest.fn() },
  };
  prisma.$transaction = jest.fn((cb: (tx: unknown) => unknown, _opts?: unknown) => cb(prisma));
  return prisma as MockPrisma;
}

function createService(prisma: MockPrisma) {
  const schools = { findOneAccessibleOrThrow: jest.fn().mockResolvedValue(undefined) };
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  const service = new StudentLifecycleService(
    prisma as unknown as PrismaService,
    schools as unknown as SchoolsService,
    audit as unknown as AuditService,
  );
  return { service, schools, audit };
}

// The Form 1 class lookup requires level 1 + a SECONDARY division — the
// fixture bakes that in so callers only need to override what a given test
// actually cares about.
const FORM1_CLASS = { id: "class-form1", name: "Form 1", sections: [{ id: "sec-1", name: "A", capacity: null }] };

function completedEnrollment(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "enr-1",
    studentId: "student-1",
    organizationId: "org-1",
    academicYearId: "year-1",
    studentNumber: "STU-1",
    rollNumber: 5,
    status: "COMPLETED",
    student: { firstName: "A", lastName: "One", currentStatus: "COMPLETED" },
    class: { division: { type: "PRIMARY" } },
    ...overrides,
  };
}

describe("StudentLifecycleService.previewForm1Transition", () => {
  let prisma: MockPrisma;
  let service: StudentLifecycleService;

  beforeEach(() => {
    prisma = createMockPrisma();
    ({ service } = createService(prisma));
    prisma.class.findFirst.mockResolvedValue(FORM1_CLASS);
    prisma.academicYear.findFirst.mockResolvedValue({ id: "year-2", name: "2028" });
  });

  function dto(overrides: Partial<PreviewForm1TransitionDto> = {}): PreviewForm1TransitionDto {
    return { toClassId: "class-form1", toAcademicYearId: "year-2", enrollmentIds: ["enr-1"], ...overrides };
  }

  it("rejects a toClassId that isn't a level-1 class in this school's Secondary division", async () => {
    prisma.class.findFirst.mockResolvedValue(null);
    await expect(service.previewForm1Transition(ACTOR, "school-1", dto())).rejects.toThrow(
      "Target class must be a level-1 (Form 1) class in this school's Secondary division",
    );
  });

  it("rejects a toAcademicYearId that doesn't belong to this school", async () => {
    prisma.academicYear.findFirst.mockResolvedValue(null);
    await expect(service.previewForm1Transition(ACTOR, "school-1", dto())).rejects.toThrow(
      "That academic year does not belong to this school",
    );
  });

  it("flags an enrollment id not found in this school", async () => {
    prisma.studentEnrollment.findMany.mockResolvedValue([]);
    const result = await service.previewForm1Transition(ACTOR, "school-1", dto());
    expect(result.ineligible).toEqual([{ enrollmentId: "enr-1", reason: "Enrollment not found in this school" }]);
    expect(result.eligible).toEqual([]);
  });

  it("flags a non-Primary-division enrollment", async () => {
    prisma.studentEnrollment.findMany.mockResolvedValue([
      completedEnrollment({ class: { division: { type: "SECONDARY" } } }),
    ]);
    const result = await service.previewForm1Transition(ACTOR, "school-1", dto());
    expect(result.ineligible).toEqual([{ enrollmentId: "enr-1", reason: "Not a Primary-division enrollment" }]);
  });

  it("flags an enrollment whose status isn't COMPLETED", async () => {
    prisma.studentEnrollment.findMany.mockResolvedValue([completedEnrollment({ status: "ACTIVE" })]);
    const result = await service.previewForm1Transition(ACTOR, "school-1", dto());
    expect(result.ineligible).toEqual([{ enrollmentId: "enr-1", reason: "Enrollment status is ACTIVE, not COMPLETED" }]);
  });

  it("flags a student whose currentStatus isn't COMPLETED (already moved on)", async () => {
    prisma.studentEnrollment.findMany.mockResolvedValue([
      completedEnrollment({ student: { firstName: "A", lastName: "One", currentStatus: "ACTIVE" } }),
    ]);
    const result = await service.previewForm1Transition(ACTOR, "school-1", dto());
    expect(result.ineligible).toEqual([
      { enrollmentId: "enr-1", reason: "Student is currently ACTIVE, not awaiting enrollment" },
    ]);
  });

  it("returns an eligible entry carrying the enrollment's studentNumber and rollNumber forward", async () => {
    prisma.studentEnrollment.findMany.mockResolvedValue([completedEnrollment()]);
    const result = await service.previewForm1Transition(ACTOR, "school-1", dto());
    expect(result.eligible).toEqual([
      { enrollmentId: "enr-1", studentId: "student-1", firstName: "A", lastName: "One", studentNumber: "STU-1", rollNumber: 5 },
    ]);
    expect(result.ineligible).toEqual([]);
  });

  it("computes available capacity for each of the destination class's sections", async () => {
    prisma.class.findFirst.mockResolvedValue({
      id: "class-form1",
      name: "Form 1",
      sections: [{ id: "sec-1", name: "A", capacity: 30 }, { id: "sec-2", name: "B", capacity: null }],
    });
    prisma.studentEnrollment.findMany.mockResolvedValue([]);
    prisma.studentEnrollment.count.mockResolvedValueOnce(28).mockResolvedValueOnce(12);

    const result = await service.previewForm1Transition(ACTOR, "school-1", dto());

    expect(result.targetSections).toEqual([
      { id: "sec-1", name: "A", capacity: 30, currentActive: 28, available: 2 },
      { id: "sec-2", name: "B", capacity: null, currentActive: 12, available: null },
    ]);
  });
});

describe("StudentLifecycleService.confirmForm1Transition", () => {
  let prisma: MockPrisma;
  let service: StudentLifecycleService;

  beforeEach(() => {
    prisma = createMockPrisma();
    ({ service } = createService(prisma));
    prisma.class.findFirst.mockResolvedValue(FORM1_CLASS);
    prisma.academicYear.findFirst.mockResolvedValue({ id: "year-2", name: "2028" });
    prisma.section.findMany.mockResolvedValue([{ id: "sec-1", name: "A", capacity: null }]);
    prisma.studentEnrollment.findMany.mockResolvedValue([completedEnrollment()]);
    prisma.studentEnrollment.aggregate.mockResolvedValue({ _max: { rollNumber: null } });
    prisma.studentEnrollment.create.mockResolvedValue({ id: "new-enr-1" });
    prisma.promotionBatch.create.mockResolvedValue({ id: "batch-1" });
  });

  function dto(overrides: Partial<ConfirmForm1TransitionDto> = {}): ConfirmForm1TransitionDto {
    return {
      toClassId: "class-form1",
      toAcademicYearId: "year-2",
      assignments: [{ enrollmentId: "enr-1", sectionId: "sec-1" }],
      ...overrides,
    };
  }

  it("rejects the same enrollment assigned twice", async () => {
    await expect(
      service.confirmForm1Transition(
        ACTOR,
        "school-1",
        dto({
          assignments: [
            { enrollmentId: "enr-1", sectionId: "sec-1" },
            { enrollmentId: "enr-1", sectionId: "sec-1" },
          ],
        }),
      ),
    ).rejects.toThrow("The same enrollment can't be assigned twice");
  });

  it("rejects a sectionId that doesn't belong to the destination class", async () => {
    prisma.section.findMany.mockResolvedValue([]); // none of the requested sectionIds matched
    await expect(service.confirmForm1Transition(ACTOR, "school-1", dto())).rejects.toThrow(
      "One or more target sections don't belong to the destination class",
    );
  });

  it("rejects when an assigned enrollment isn't found in this school", async () => {
    prisma.studentEnrollment.findMany.mockResolvedValue([]);
    await expect(service.confirmForm1Transition(ACTOR, "school-1", dto())).rejects.toThrow(
      "One or more enrollments were not found in this school",
    );
  });

  it("rejects a mixed-academic-year selection outright, rather than picking the first one", async () => {
    prisma.studentEnrollment.findMany.mockResolvedValue([
      completedEnrollment({ id: "enr-1", academicYearId: "year-1" }),
      completedEnrollment({ id: "enr-2", academicYearId: "year-1-alt" }),
    ]);
    await expect(
      service.confirmForm1Transition(
        ACTOR,
        "school-1",
        dto({ assignments: [{ enrollmentId: "enr-1", sectionId: "sec-1" }, { enrollmentId: "enr-2", sectionId: "sec-1" }] }),
      ),
    ).rejects.toThrow(
      "All selected students must be completing from the same academic year — run separate transitions for each year",
    );
  });

  it("rejects a non-Primary-division enrollment by name, inside the write path too", async () => {
    prisma.studentEnrollment.findMany.mockResolvedValue([
      completedEnrollment({ class: { division: { type: "SECONDARY" } } }),
    ]);
    await expect(service.confirmForm1Transition(ACTOR, "school-1", dto())).rejects.toThrow(
      "Student student-1's enrollment is not a Primary-division enrollment",
    );
  });

  it("rejects an enrollment that isn't COMPLETED", async () => {
    prisma.studentEnrollment.findMany.mockResolvedValue([completedEnrollment({ status: "ACTIVE" })]);
    await expect(service.confirmForm1Transition(ACTOR, "school-1", dto())).rejects.toThrow(
      "Student student-1 is not COMPLETED (currently ACTIVE)",
    );
  });

  it("rejects a student whose currentStatus has already moved past COMPLETED", async () => {
    prisma.studentEnrollment.findMany.mockResolvedValue([
      completedEnrollment({ student: { firstName: "A", lastName: "One", currentStatus: "ACTIVE" } }),
    ]);
    await expect(service.confirmForm1Transition(ACTOR, "school-1", dto())).rejects.toThrow(
      "Student student-1 is currently ACTIVE, not awaiting enrollment",
    );
  });

  it("rejects when a target section can't fit the incoming students on top of who's already active there", async () => {
    prisma.section.findMany.mockResolvedValue([{ id: "sec-1", name: "A", capacity: 1 }]);
    prisma.studentEnrollment.count.mockResolvedValue(1); // already full
    await expect(service.confirmForm1Transition(ACTOR, "school-1", dto())).rejects.toThrow(
      "Section A doesn't have room for 1 more student(s) (capacity 1, currently 1)",
    );
  });

  it("creates the new ACTIVE enrollment carrying studentNumber forward, and sets the student ACTIVE", async () => {
    await service.confirmForm1Transition(ACTOR, "school-1", dto());

    expect(prisma.studentEnrollment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          studentNumber: "STU-1",
          status: "ACTIVE",
          classId: "class-form1",
          sectionId: "sec-1",
          academicYearId: "year-2",
        }),
      }),
    );
    expect(prisma.student.update).toHaveBeenCalledWith({ where: { id: "student-1" }, data: { currentStatus: "ACTIVE" } });
  });

  it("leaves the old Class-8 enrollment's own status untouched — only updates the PromotionItem's toEnrollmentId", async () => {
    await service.confirmForm1Transition(ACTOR, "school-1", dto());

    expect(prisma.studentEnrollment.create).not.toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "enr-1" } }),
    );
    expect(prisma.promotionItem.update).toHaveBeenCalledWith({
      where: { fromEnrollmentId: "enr-1" },
      data: { toEnrollmentId: "new-enr-1" },
    });
  });

  it("assigns fresh, sequential roll numbers per destination section, continuing from the current max", async () => {
    prisma.studentEnrollment.aggregate.mockResolvedValue({ _max: { rollNumber: 7 } });
    prisma.studentEnrollment.create
      .mockResolvedValueOnce({ id: "new-enr-1" })
      .mockResolvedValueOnce({ id: "new-enr-2" });
    prisma.studentEnrollment.findMany.mockResolvedValue([
      completedEnrollment({ id: "enr-1", studentId: "student-1" }),
      completedEnrollment({ id: "enr-2", studentId: "student-2" }),
    ]);

    await service.confirmForm1Transition(
      ACTOR,
      "school-1",
      dto({
        assignments: [
          { enrollmentId: "enr-1", sectionId: "sec-1" },
          { enrollmentId: "enr-2", sectionId: "sec-1" },
        ],
      }),
    );

    expect(prisma.studentEnrollment.create).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ data: expect.objectContaining({ rollNumber: 8 }) }),
    );
    expect(prisma.studentEnrollment.create).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ data: expect.objectContaining({ rollNumber: 9 }) }),
    );
  });

  it("records the audit entry under Student Lifecycle / FORM_1_TRANSITION, inside the same transaction", async () => {
    const { service: freshService, audit } = createService(prisma);
    await freshService.confirmForm1Transition(ACTOR, "school-1", dto());

    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "FORM_1_TRANSITION",
        module: "Student Lifecycle",
        after: expect.objectContaining({ studentCount: 1, toClass: "Form 1", toAcademicYear: "2028" }),
      }),
      prisma,
    );
  });

  it("returns the created batch merged with the per-student results", async () => {
    const result = await service.confirmForm1Transition(ACTOR, "school-1", dto());
    expect(result).toEqual(
      expect.objectContaining({
        id: "batch-1",
        results: [
          expect.objectContaining({ studentId: "student-1", fromEnrollmentId: "enr-1", toEnrollmentId: "new-enr-1", sectionId: "sec-1" }),
        ],
      }),
    );
  });
});
