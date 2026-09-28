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
      "Target class must be a level-1 (Form 1) class of 2028 in this school's Secondary division",
    );
  });

  it("looks the destination Form 1 up by level, Secondary division AND the destination academic year", async () => {
    prisma.studentEnrollment.findMany.mockResolvedValue([]);
    await service.previewForm1Transition(ACTOR, "school-1", dto());
    expect(prisma.class.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "class-form1", level: 1, academicYearId: "year-2", division: { schoolId: "school-1", type: "SECONDARY" } },
      }),
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

describe("StudentLifecycleService — Form 1 in another school of the organization", () => {
  let prisma: MockPrisma;
  let service: StudentLifecycleService;
  let schools: { findOneAccessibleOrThrow: jest.Mock };

  beforeEach(() => {
    prisma = createMockPrisma();
    ({ service, schools } = createService(prisma));
    schools.findOneAccessibleOrThrow.mockImplementation((_actor: unknown, id: string) =>
      Promise.resolve({ id, organizationId: id === "school-other-org" ? "org-2" : "org-1" }),
    );
    prisma.class.findFirst.mockResolvedValue(FORM1_CLASS);
    prisma.academicYear.findFirst.mockResolvedValue({ id: "year-2", name: "2028" });
  });

  it("looks the destination year and Form 1 up in the destination school, after checking access to both schools", async () => {
    prisma.studentEnrollment.findMany.mockResolvedValue([]);
    await service.previewForm1Transition(ACTOR, "school-1", {
      toSchoolId: "school-2",
      toClassId: "class-form1",
      toAcademicYearId: "year-2",
      enrollmentIds: [],
    });

    expect(schools.findOneAccessibleOrThrow).toHaveBeenCalledWith(ACTOR, "school-1");
    expect(schools.findOneAccessibleOrThrow).toHaveBeenCalledWith(ACTOR, "school-2");
    expect(prisma.academicYear.findFirst).toHaveBeenCalledWith({ where: { id: "year-2", schoolId: "school-2" } });
    expect(prisma.class.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ division: { schoolId: "school-2", type: "SECONDARY" } }) }),
    );
  });

  it("refuses a destination school in a different organization", async () => {
    await expect(
      service.previewForm1Transition(ACTOR, "school-1", {
        toSchoolId: "school-other-org",
        toClassId: "class-form1",
        toAcademicYearId: "year-2",
        enrollmentIds: [],
      }),
    ).rejects.toThrow("The destination school must belong to the same organization");
  });

  it("flags a student whose permanent ID is already used at the destination school that year", async () => {
    prisma.studentEnrollment.findMany
      .mockResolvedValueOnce([completedEnrollment()])
      .mockResolvedValueOnce([{ studentNumber: "STU-1" }]);
    prisma.studentEnrollment.count.mockResolvedValue(0);

    const result = await service.previewForm1Transition(ACTOR, "school-1", {
      toSchoolId: "school-2",
      toClassId: "class-form1",
      toAcademicYearId: "year-2",
      enrollmentIds: ["enr-1"],
    });

    expect(result.eligible).toEqual([]);
    expect(result.ineligible[0].reason).toMatch(/STU-1 is already in use at the destination school/);
  });

  it("creates the ACTIVE Form 1 enrollment in the destination school, keeping the permanent Student ID", async () => {
    prisma.section.findMany.mockResolvedValue([{ id: "sec-1", name: "A", capacity: null }]);
    prisma.studentEnrollment.findMany
      .mockResolvedValueOnce([{ ...completedEnrollment(), schoolId: "school-1" }])
      .mockResolvedValueOnce([]);
    prisma.studentEnrollment.aggregate.mockResolvedValue({ _max: { rollNumber: null } });
    prisma.promotionBatch.create.mockResolvedValue({ id: "batch-1" });
    prisma.studentEnrollment.create.mockResolvedValue({ id: "enr-new" });

    await service.confirmForm1Transition(ACTOR, "school-1", {
      toSchoolId: "school-2",
      toClassId: "class-form1",
      toAcademicYearId: "year-2",
      assignments: [{ enrollmentId: "enr-1", sectionId: "sec-1" }],
    });

    expect(prisma.studentEnrollment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ schoolId: "school-2", studentNumber: "STU-1", status: "ACTIVE", classId: "class-form1" }),
    });
    // The source Class 8 enrollment is never rewritten — it stays COMPLETED.
    expect(prisma.promotionItem.update).toHaveBeenCalledWith({
      where: { fromEnrollmentId: "enr-1" },
      data: { toEnrollmentId: "enr-new" },
    });
    expect(prisma.promotionBatch.create).toHaveBeenCalledWith({ data: expect.objectContaining({ schoolId: "school-1" }) });
  });
});

describe("StudentLifecycleService — fixed final classes and the Alumni Directory", () => {
  function setup() {
    const prisma = createMockPrisma() as MockPrisma & Record<string, unknown>;
    const classFindMany = jest.fn().mockResolvedValue([]);
    (prisma.class as unknown as { findMany: jest.Mock }).findMany = classFindMany;
    prisma.studentEnrollment.count.mockResolvedValue(0);
    prisma.studentEnrollment.findMany.mockResolvedValue([]);
    prisma.section.findMany.mockResolvedValue([{ name: "A" }, { name: "B" }]);
    const { service } = createService(prisma as MockPrisma);
    return { prisma, service, classFindMany };
  }

  it("finds graduation candidates only in Form 4 — never the highest class a school happens to have", async () => {
    const { service, classFindMany } = setup();
    await service.listSecondaryGraduated(ACTOR, { status: "PENDING" });
    expect(classFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ level: 4, division: expect.objectContaining({ type: "SECONDARY" }) }) }),
    );
  });

  it("lists Form 4 GRADUATED and Class 8 COMPLETED-not-continuing enrollments, with section facets", async () => {
    const { service, prisma } = setup();
    const result = await service.listAlumniDirectory(ACTOR, {});

    const where = prisma.studentEnrollment.findMany.mock.calls[0][0].where;
    const division = where.AND[1];
    expect(division.OR).toEqual([
      { status: "GRADUATED", class: { level: 4, division: { type: "SECONDARY" } } },
      {
        status: "COMPLETED",
        class: { level: 8, division: { type: "PRIMARY" } },
        promotionFrom: { none: { toEnrollmentId: { not: null } } },
      },
    ]);
    expect(result.facets.sectionNames).toEqual(["A", "B"]);
  });

  it("narrows by division and section name", async () => {
    const { service, prisma } = setup();
    await service.listAlumniDirectory(ACTOR, { divisionType: "SECONDARY", sectionName: "B" });

    const where = prisma.studentEnrollment.findMany.mock.calls[0][0].where;
    expect(where.AND[0].AND[1]).toEqual({ status: "GRADUATED", class: { level: 4, division: { type: "SECONDARY" } } });
    expect(where.AND[1]).toEqual({ section: { name: "B" } });
  });

  it("keeps a School Admin inside their own school(s)", async () => {
    const { service, prisma } = setup();
    await service.listAlumniDirectory(ACTOR, {});
    const where = prisma.studentEnrollment.findMany.mock.calls[0][0].where;
    expect(where.AND[0]).toEqual(expect.objectContaining({ organizationId: "org-1", schoolId: { in: ["school-1"] } }));
  });
});

describe("StudentLifecycleService.reverseFinalOutcome — undo a mistaken graduation/completion", () => {
  function graduated(over: Record<string, unknown> = {}) {
    return {
      id: "enr-f4",
      schoolId: "school-1",
      studentId: "st-1",
      academicYearId: "y-2030",
      sectionId: "sec-f4a",
      studentNumber: "STU-2026-2027-00022",
      rollNumber: 1,
      status: "GRADUATED",
      student: { currentStatus: "GRADUATED" },
      academicYear: { name: "2029-2030" },
      class: { name: "Form 4" },
      section: { name: "A" },
      promotionFrom: [{ id: "item-1", batchId: "batch-1", toEnrollmentId: null }],
      ...over,
    };
  }

  function setup(enrollment: unknown, activeLookups: unknown[] = [null, null, null]) {
    const findFirst = jest.fn().mockResolvedValueOnce(enrollment);
    for (const r of activeLookups) findFirst.mockResolvedValueOnce(r);
    const prisma = {
      studentEnrollment: { findFirst, update: jest.fn(), aggregate: jest.fn().mockResolvedValue({ _max: { rollNumber: 7 } }) },
      student: { update: jest.fn() },
      promotionItem: { delete: jest.fn() },
    } as Record<string, unknown>;
    prisma.$transaction = jest.fn((cb: (tx: unknown) => unknown) => cb(prisma));
    const { service, audit } = createService(prisma as unknown as MockPrisma);
    return { service, audit, prisma: prisma as never as {
      studentEnrollment: { findFirst: jest.Mock; update: jest.Mock; aggregate: jest.Mock };
      student: { update: jest.Mock };
      promotionItem: { delete: jest.Mock };
    } };
  }

  it("restores a graduated student to ACTIVE in the same class, keeps the Student ID, frees the outcome and audits the reason", async () => {
    const { service, prisma, audit } = setup(graduated());
    const result = await service.reverseFinalOutcome(ACTOR, "school-1", "enr-f4", { reason: "Graduated by mistake — no Form 4 results" });

    expect(prisma.studentEnrollment.update).toHaveBeenCalledWith({
      where: { id: "enr-f4" },
      data: { status: "ACTIVE", endDate: null, rollNumber: 1 },
    });
    expect(prisma.student.update).toHaveBeenCalledWith({ where: { id: "st-1" }, data: { currentStatus: "ACTIVE" } });
    expect(prisma.promotionItem.delete).toHaveBeenCalledWith({ where: { id: "item-1" } });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "FINAL_OUTCOME_REVERSED",
        before: expect.objectContaining({ enrollmentStatus: "GRADUATED", promotionBatchId: "batch-1" }),
        after: expect.objectContaining({ enrollmentStatus: "ACTIVE", reason: "Graduated by mistake — no Form 4 results" }),
      }),
      expect.anything(),
    );
    expect(result).toMatchObject({ restoredFrom: "GRADUATED", className: "Form 4", sectionName: "A" });
  });

  it("gives a fresh roll number if the old one was taken meanwhile", async () => {
    const { service, prisma } = setup(graduated(), [null, null, { id: "someone-else" }]);
    await service.reverseFinalOutcome(ACTOR, "school-1", "enr-f4", {});
    expect(prisma.studentEnrollment.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ rollNumber: 8 }) }));
  });

  it("refuses anything that is not a Graduated/Completed enrollment", async () => {
    const { service } = setup(graduated({ status: "PROMOTED" }));
    await expect(service.reverseFinalOutcome(ACTOR, "school-1", "enr-f4", {})).rejects.toThrow("Only a Graduated or Completed enrollment can be restored");
  });

  it("refuses once the student has moved on (e.g. transferred or archived)", async () => {
    const { service } = setup(graduated({ student: { currentStatus: "ARCHIVED" } }));
    await expect(service.reverseFinalOutcome(ACTOR, "school-1", "enr-f4", {})).rejects.toThrow(/moved on since/);
  });

  it("refuses a Class 8 completion that already continued to Form 1", async () => {
    const { service } = setup(
      graduated({ status: "COMPLETED", student: { currentStatus: "COMPLETED" }, promotionFrom: [{ id: "i", batchId: "b", toEnrollmentId: "enr-form1" }] }),
    );
    await expect(service.reverseFinalOutcome(ACTOR, "school-1", "enr-f4", {})).rejects.toThrow(/already continued to Form 1/);
  });

  it("refuses when the student already holds another active enrollment", async () => {
    const { service } = setup(graduated(), [{ id: "enr-other" }]);
    await expect(service.reverseFinalOutcome(ACTOR, "school-1", "enr-f4", {})).rejects.toThrow(/already has an active enrollment/);
  });

  it("is scoped to the given school", async () => {
    const { service } = setup(null);
    await expect(service.reverseFinalOutcome(ACTOR, "school-1", "enr-x", {})).rejects.toThrow("Enrollment not found in this school");
  });
});
