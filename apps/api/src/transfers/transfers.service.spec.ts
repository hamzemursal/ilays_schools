import { BadRequestException, NotFoundException } from "@nestjs/common";
import type { AuthenticatedUser } from "../auth/types/authenticated-user";
import { TransfersService } from "./transfers.service";
import { PrismaService } from "../prisma/prisma.service";
import { SchoolsService } from "../schools/schools.service";
import { AuditService } from "../audit/audit.service";
import type { RequestTransferDto } from "./dto/request-transfer.dto";
import type { ApproveTransferDto } from "./dto/approve-transfer.dto";
import type { ConfirmBulkTransferDto } from "./dto/confirm-bulk-transfer.dto";

const ACTOR: AuthenticatedUser = {
  id: "admin-1",
  email: "admin@example.com",
  organizationId: "org-1",
  roles: ["SCHOOL_ADMIN"],
  permissions: ["transfers.create", "transfers.approve"],
  schoolIds: ["school-1"],
};

type MockPrisma = {
  student: { findUnique: jest.Mock; findMany: jest.Mock; update: jest.Mock };
  school: { findFirst: jest.Mock; findMany: jest.Mock };
  transfer: { findFirst: jest.Mock; findMany: jest.Mock; findUnique: jest.Mock; create: jest.Mock; update: jest.Mock; count: jest.Mock };
  section: { findFirst: jest.Mock; findMany: jest.Mock };
  academicYear: { findFirst: jest.Mock };
  class: { findFirst: jest.Mock };
  studentEnrollment: { count: jest.Mock; update: jest.Mock; create: jest.Mock; aggregate: jest.Mock };
  user: { findMany: jest.Mock };
  $transaction: jest.Mock;
};

function createMockPrisma(): MockPrisma {
  const prisma: Partial<MockPrisma> = {
    student: { findUnique: jest.fn(), findMany: jest.fn(), update: jest.fn() },
    school: { findFirst: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
    transfer: { findFirst: jest.fn(), findMany: jest.fn(), findUnique: jest.fn(), create: jest.fn(), update: jest.fn(), count: jest.fn() },
    section: { findFirst: jest.fn(), findMany: jest.fn() },
    academicYear: { findFirst: jest.fn() },
    class: { findFirst: jest.fn() },
    studentEnrollment: { count: jest.fn(), update: jest.fn(), create: jest.fn(), aggregate: jest.fn() },
    user: { findMany: jest.fn().mockResolvedValue([]) },
  };
  prisma.$transaction = jest.fn((cb: (tx: unknown) => unknown) => cb(prisma));
  return prisma as MockPrisma;
}

function createService(prisma: MockPrisma) {
  const schools = { findOneAccessibleOrThrow: jest.fn().mockResolvedValue(undefined) };
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  const service = new TransfersService(
    prisma as unknown as PrismaService,
    schools as unknown as SchoolsService,
    audit as unknown as AuditService,
  );
  return { service, schools, audit };
}

function enrollment(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "enr-1",
    schoolId: "school-1",
    status: "ACTIVE",
    class: { name: "Class 1" },
    section: { name: "A" },
    academicYear: { name: "2027" },
    ...overrides,
  };
}

describe("TransfersService.request", () => {
  let prisma: MockPrisma;
  let service: TransfersService;

  beforeEach(() => {
    prisma = createMockPrisma();
    ({ service } = createService(prisma));
    prisma.transfer.create.mockResolvedValue({ id: "transfer-1" });
    prisma.transfer.findUnique.mockResolvedValue({
      id: "transfer-1",
      fromSchoolId: "school-1",
      toSchoolId: "school-2",
      requestedByUserId: "admin-1",
      approvedByUserId: null,
      student: {},
      fromEnrollment: { class: {}, section: {}, academicYear: {} },
      toEnrollment: null,
    });
  });

  function dto(overrides: Partial<RequestTransferDto> = {}): RequestTransferDto {
    return { toSchoolId: "school-2", ...overrides };
  }

  it("throws NotFoundException when the student doesn't exist or belongs to a different organization", async () => {
    prisma.student.findUnique.mockResolvedValue(null);
    await expect(service.request(ACTOR, "student-1", dto())).rejects.toThrow(NotFoundException);

    prisma.student.findUnique.mockResolvedValue({ organizationId: "other-org", enrollments: [] });
    await expect(service.request(ACTOR, "student-1", dto())).rejects.toThrow(NotFoundException);
  });

  it("rejects a student with no enrollment at all, or one not in a transferable status", async () => {
    prisma.student.findUnique.mockResolvedValue({ organizationId: "org-1", enrollments: [] });
    await expect(service.request(ACTOR, "student-1", dto())).rejects.toThrow(
      "Student has no current enrollment to transfer from",
    );

    prisma.student.findUnique.mockResolvedValue({
      organizationId: "org-1",
      enrollments: [enrollment({ status: "PROMOTED" })],
    });
    await expect(service.request(ACTOR, "student-1", dto())).rejects.toThrow(
      "Student has no current enrollment to transfer from",
    );
  });

  it.each(["ACTIVE", "COMPLETED", "GRADUATED"])("allows transferring from a %s enrollment", async (status) => {
    prisma.student.findUnique.mockResolvedValue({
      organizationId: "org-1",
      enrollments: [enrollment({ status })],
    });
    prisma.school.findFirst.mockResolvedValue({ id: "school-2" });
    await expect(service.request(ACTOR, "student-1", dto())).resolves.toBeDefined();
  });

  it("treats a source enrollment outside the actor's schoolIds as if the student doesn't exist", async () => {
    prisma.student.findUnique.mockResolvedValue({
      organizationId: "org-1",
      enrollments: [enrollment({ schoolId: "some-other-school" })],
    });
    await expect(service.request(ACTOR, "student-1", dto())).rejects.toThrow(NotFoundException);
  });

  it("allows any school for an org-wide actor (empty schoolIds)", async () => {
    const orgActor: AuthenticatedUser = { ...ACTOR, schoolIds: [] };
    prisma.student.findUnique.mockResolvedValue({
      organizationId: "org-1",
      enrollments: [enrollment({ schoolId: "some-other-school" })],
    });
    prisma.school.findFirst.mockResolvedValue({ id: "school-2" });
    await expect(service.request(orgActor, "student-1", dto())).resolves.toBeDefined();
  });

  it("rejects requesting a transfer to the student's current school", async () => {
    // schoolId must match one of the actor's own schoolIds (ACTOR only has
    // "school-1") or the school-scoping check fires first with a different
    // message — this is deliberately a same-school request, not a realistic
    // destination choice, just to isolate this one guard.
    prisma.student.findUnique.mockResolvedValue({
      organizationId: "org-1",
      enrollments: [enrollment({ schoolId: "school-1" })],
    });
    await expect(service.request(ACTOR, "student-1", dto({ toSchoolId: "school-1" }))).rejects.toThrow(
      "Student is already enrolled at that school",
    );
  });

  it("rejects a destination school not found in this organization", async () => {
    prisma.student.findUnique.mockResolvedValue({ organizationId: "org-1", enrollments: [enrollment()] });
    prisma.school.findFirst.mockResolvedValue(null);
    await expect(service.request(ACTOR, "student-1", dto())).rejects.toThrow(
      "Destination school not found in this organization",
    );
  });

  it("rejects when the student already has a pending transfer request", async () => {
    prisma.student.findUnique.mockResolvedValue({ organizationId: "org-1", enrollments: [enrollment()] });
    prisma.school.findFirst.mockResolvedValue({ id: "school-2" });
    prisma.transfer.findFirst.mockResolvedValue({ id: "existing-transfer" });
    await expect(service.request(ACTOR, "student-1", dto())).rejects.toThrow(
      "This student already has a pending transfer request — cancel it before requesting another",
    );
    expect(prisma.transfer.create).not.toHaveBeenCalled();
  });
});

describe("TransfersService.approve", () => {
  let prisma: MockPrisma;
  let service: TransfersService;
  let schools: { findOneAccessibleOrThrow: jest.Mock };

  beforeEach(() => {
    prisma = createMockPrisma();
    ({ service, schools } = createService(prisma));
    // A single persistent REQUESTED transfer backs both approve()'s own
    // gating check and its later re-fetch via getOne() at the end of the
    // method — none of these tests assert on getOne()'s returned status,
    // only on the side effects (update/create calls) approve() makes along
    // the way, so one consistent value for every call is enough.
    prisma.transfer.findUnique.mockResolvedValue({
      id: "transfer-1",
      status: "REQUESTED",
      studentId: "student-1",
      fromEnrollmentId: "enr-1",
      fromSchoolId: "school-1",
      toSchoolId: "school-2",
      requestedByUserId: "admin-1",
      approvedByUserId: null,
      student: {},
      fromEnrollment: enrollment(),
      toEnrollment: null,
    });
    prisma.section.findFirst.mockResolvedValue({ id: "section-2", name: "B", capacity: null, class: { name: "Class 2" } });
    prisma.academicYear.findFirst.mockResolvedValue({ id: "year-2", name: "2027" });
    prisma.studentEnrollment.create.mockResolvedValue({ id: "new-enr-1" });
    prisma.studentEnrollment.aggregate.mockResolvedValue({ _max: { rollNumber: null } });
    prisma.studentEnrollment.count.mockResolvedValue(0);
  });

  function dto(overrides: Partial<ApproveTransferDto> = {}): ApproveTransferDto {
    return { academicYearId: "year-2", classId: "class-2", sectionId: "section-2", ...overrides };
  }

  it("throws NotFoundException for a missing transfer", async () => {
    prisma.transfer.findUnique.mockResolvedValueOnce(null);
    await expect(service.approve(ACTOR, "transfer-1", dto())).rejects.toThrow(NotFoundException);
  });

  it("rejects approving a transfer that isn't REQUESTED", async () => {
    prisma.transfer.findUnique.mockResolvedValueOnce({ status: "EXECUTED" });
    await expect(service.approve(ACTOR, "transfer-1", dto())).rejects.toThrow("Transfer is not pending");
  });

  it("checks access to the destination school specifically, not the origin", async () => {
    await service.approve(ACTOR, "transfer-1", dto());
    expect(schools.findOneAccessibleOrThrow).toHaveBeenCalledWith(ACTOR, "school-2");
  });

  it("rejects a section that doesn't belong to the destination school's class", async () => {
    prisma.section.findFirst.mockResolvedValueOnce(null);
    await expect(service.approve(ACTOR, "transfer-1", dto())).rejects.toThrow(
      "That section does not belong to the destination school's class",
    );
  });

  it("rejects an academic year not belonging to the destination school", async () => {
    prisma.academicYear.findFirst.mockResolvedValueOnce(null);
    await expect(service.approve(ACTOR, "transfer-1", dto())).rejects.toThrow(
      "That academic year does not belong to the destination school",
    );
  });

  it("rejects when the destination section is at capacity", async () => {
    prisma.section.findFirst.mockResolvedValueOnce({ id: "section-2", name: "B", capacity: 5, class: { name: "Class 2" } });
    prisma.studentEnrollment.count.mockResolvedValueOnce(5);
    await expect(service.approve(ACTOR, "transfer-1", dto())).rejects.toThrow(
      "Section B is at capacity (5)",
    );
  });

  it("closes out the source enrollment as TRANSFERRED_OUT and creates a new ACTIVE one at the destination", async () => {
    await service.approve(ACTOR, "transfer-1", dto());
    expect(prisma.studentEnrollment.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "enr-1" }, data: expect.objectContaining({ status: "TRANSFERRED_OUT" }) }),
    );
    expect(prisma.studentEnrollment.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ schoolId: "school-2", status: "ACTIVE" }) }),
    );
  });

  it("moves the transfer to EXECUTED (never APPROVED — that enum value is never produced)", async () => {
    await service.approve(ACTOR, "transfer-1", dto());
    expect(prisma.transfer.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "EXECUTED" }) }),
    );
  });

  it("resets the student's currentStatus to ACTIVE, covering a student coming from an awaiting-enrollment state", async () => {
    await service.approve(ACTOR, "transfer-1", dto());
    expect(prisma.student.update).toHaveBeenCalledWith({
      where: { id: "student-1" },
      data: { currentStatus: "ACTIVE" },
    });
  });
});

describe("TransfersService.reject / cancel", () => {
  let prisma: MockPrisma;
  let service: TransfersService;
  let schools: { findOneAccessibleOrThrow: jest.Mock };

  beforeEach(() => {
    prisma = createMockPrisma();
    ({ service, schools } = createService(prisma));
  });

  function pendingTransfer(overrides: Partial<Record<string, unknown>> = {}) {
    return {
      id: "transfer-1",
      status: "REQUESTED",
      fromSchoolId: "school-1",
      toSchoolId: "school-2",
      requestedByUserId: "admin-1",
      approvedByUserId: null,
      fromEnrollment: enrollment(),
      student: {},
      toEnrollment: null,
      ...overrides,
    };
  }

  it("reject: throws NotFoundException for a missing transfer", async () => {
    prisma.transfer.findUnique.mockResolvedValue(null);
    await expect(service.reject(ACTOR, "transfer-1", { reason: "Not eligible" })).rejects.toThrow(NotFoundException);
  });

  it("reject: rejects a transfer that isn't REQUESTED", async () => {
    prisma.transfer.findUnique.mockResolvedValue(pendingTransfer({ status: "REJECTED" }));
    await expect(service.reject(ACTOR, "transfer-1", { reason: "x" })).rejects.toThrow("Transfer is not pending");
  });

  it("reject: checks access to the destination school (same rule as approve, tighter than getOne)", async () => {
    prisma.transfer.findUnique.mockResolvedValue(pendingTransfer());
    await service.reject(ACTOR, "transfer-1", { reason: "Missing documents" });
    expect(schools.findOneAccessibleOrThrow).toHaveBeenCalledWith(ACTOR, "school-2");
    expect(prisma.transfer.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: "REJECTED", rejectionReason: "Missing documents" } }),
    );
  });

  it("cancel: only a REQUESTED transfer can be cancelled", async () => {
    prisma.transfer.findUnique.mockResolvedValue(pendingTransfer({ status: "EXECUTED" }));
    await expect(service.cancel(ACTOR, "transfer-1")).rejects.toThrow("Only a pending transfer can be cancelled");
  });

  it("cancel: checks access to the ORIGIN school, not the destination — the opposite of reject", async () => {
    // Actor only has access to "school-1" (the fromSchoolId here); the
    // transfer's toSchoolId is a different, inaccessible school.
    prisma.transfer.findUnique.mockResolvedValue(pendingTransfer({ fromSchoolId: "school-1", toSchoolId: "school-9" }));
    await expect(service.cancel(ACTOR, "transfer-1")).resolves.toBeDefined();
    // Manual check, not schools.findOneAccessibleOrThrow — confirmed by it
    // never being called for this path.
    expect(schools.findOneAccessibleOrThrow).not.toHaveBeenCalled();
  });

  it("cancel: denies an actor with no access to the origin school (as a not-found, not forbidden)", async () => {
    prisma.transfer.findUnique.mockResolvedValue(pendingTransfer({ fromSchoolId: "some-other-school" }));
    await expect(service.cancel(ACTOR, "transfer-1")).rejects.toThrow(NotFoundException);
  });

  it("cancel: an org-wide actor (empty schoolIds) can cancel any transfer", async () => {
    const orgActor: AuthenticatedUser = { ...ACTOR, schoolIds: [] };
    prisma.transfer.findUnique.mockResolvedValue(pendingTransfer({ fromSchoolId: "some-other-school" }));
    await expect(service.cancel(orgActor, "transfer-1")).resolves.toBeDefined();
  });
});

describe("TransfersService.getOne — either side can view", () => {
  let prisma: MockPrisma;
  let service: TransfersService;

  beforeEach(() => {
    prisma = createMockPrisma();
    ({ service } = createService(prisma));
  });

  function transfer(overrides: Partial<Record<string, unknown>> = {}) {
    return {
      id: "transfer-1",
      fromSchoolId: "school-1",
      toSchoolId: "school-2",
      requestedByUserId: "admin-1",
      approvedByUserId: null,
      student: {},
      fromEnrollment: null,
      toEnrollment: null,
      ...overrides,
    };
  }

  it("throws NotFoundException for a missing transfer", async () => {
    prisma.transfer.findUnique.mockResolvedValue(null);
    await expect(service.getOne(ACTOR, "transfer-1")).rejects.toThrow(NotFoundException);
  });

  it("allows viewing when the actor's schoolIds include the ORIGIN school", async () => {
    prisma.transfer.findUnique.mockResolvedValue(transfer({ fromSchoolId: "school-1", toSchoolId: "school-9" }));
    await expect(service.getOne(ACTOR, "transfer-1")).resolves.toBeDefined();
  });

  it("allows viewing when the actor's schoolIds include the DESTINATION school", async () => {
    prisma.transfer.findUnique.mockResolvedValue(transfer({ fromSchoolId: "school-9", toSchoolId: "school-1" }));
    await expect(service.getOne(ACTOR, "transfer-1")).resolves.toBeDefined();
  });

  it("denies viewing when the actor has neither side of the transfer", async () => {
    prisma.transfer.findUnique.mockResolvedValue(transfer({ fromSchoolId: "school-8", toSchoolId: "school-9" }));
    await expect(service.getOne(ACTOR, "transfer-1")).rejects.toThrow(NotFoundException);
  });

  it("substitutes '(deleted school)'/'(deleted user)' when the referenced row no longer exists", async () => {
    prisma.transfer.findUnique.mockResolvedValue(transfer());
    prisma.school.findMany.mockResolvedValue([]); // neither school resolves
    prisma.user.findMany.mockResolvedValue([]);
    const result = await service.getOne(ACTOR, "transfer-1");
    expect(result.fromSchoolName).toBe("(deleted school)");
    expect(result.requestedByEmail).toBe("(deleted user)");
  });
});

describe("TransfersService.previewBulkTransfer", () => {
  let prisma: MockPrisma;
  let service: TransfersService;
  let schools: { findOneAccessibleOrThrow: jest.Mock };

  beforeEach(() => {
    prisma = createMockPrisma();
    ({ service, schools } = createService(prisma));
    prisma.transfer.findMany.mockResolvedValue([]);
  });

  it("checks access to both the origin and destination school", async () => {
    prisma.student.findMany.mockResolvedValue([]);
    await service.previewBulkTransfer(ACTOR, "school-1", { toSchoolId: "school-2", studentIds: [] });
    expect(schools.findOneAccessibleOrThrow).toHaveBeenCalledWith(ACTOR, "school-1");
    expect(schools.findOneAccessibleOrThrow).toHaveBeenCalledWith(ACTOR, "school-2");
  });

  it("sorts each requested student into eligible or ineligible with a specific reason, preserving order", async () => {
    prisma.student.findMany.mockResolvedValue([
      { id: "s1", firstName: "A", lastName: "One", enrollments: [enrollment({ schoolId: "school-1" })] },
      { id: "s3", firstName: "C", lastName: "Three", enrollments: [enrollment({ schoolId: "school-1", status: "PROMOTED" })] },
      { id: "s4", firstName: "D", lastName: "Four", enrollments: [enrollment({ schoolId: "school-9" })] },
    ]);
    prisma.transfer.findMany.mockResolvedValue([{ studentId: "s1" }]); // s1 already pending

    const result = await service.previewBulkTransfer(ACTOR, "school-1", {
      toSchoolId: "school-2",
      studentIds: ["s1", "s2", "s3", "s4"],
    });

    expect(result.ineligible).toEqual([
      { studentId: "s1", reason: "Student already has a pending transfer request" },
      { studentId: "s2", reason: "Student not found in this organization" },
      { studentId: "s3", reason: "Enrollment status is PROMOTED, not transferable" },
      { studentId: "s4", reason: "Student is not currently enrolled at this school" },
    ]);
    expect(result.eligible).toEqual([]);
  });

  it("flags 'already enrolled at that school' only when the origin school IS the requested destination", async () => {
    // The origin-enrollment check runs first, so this reason can only ever
    // surface for a (deliberately degenerate) same-school request — see the
    // equivalent case in request().
    prisma.student.findMany.mockResolvedValue([
      { id: "s1", firstName: "A", lastName: "One", enrollments: [enrollment({ schoolId: "school-1" })] },
    ]);
    const result = await service.previewBulkTransfer(ACTOR, "school-1", {
      toSchoolId: "school-1",
      studentIds: ["s1"],
    });
    expect(result.ineligible).toEqual([{ studentId: "s1", reason: "Student is already enrolled at that school" }]);
  });

  it("never throws for per-student problems — it's preview-only", async () => {
    prisma.student.findMany.mockResolvedValue([]);
    await expect(
      service.previewBulkTransfer(ACTOR, "school-1", { toSchoolId: "school-2", studentIds: ["missing-1"] }),
    ).resolves.toBeDefined();
  });
});

describe("TransfersService.confirmBulkTransfer", () => {
  let prisma: MockPrisma;
  let service: TransfersService;

  beforeEach(() => {
    prisma = createMockPrisma();
    ({ service } = createService(prisma));
    prisma.class.findFirst.mockResolvedValue({ id: "class-2", name: "Class 2" });
    prisma.academicYear.findFirst.mockResolvedValue({ id: "year-2", name: "2027" });
    prisma.section.findMany.mockResolvedValue([{ id: "section-2", name: "B", capacity: null, classId: "class-2" }]);
    prisma.student.findMany.mockResolvedValue([
      { id: "s1", enrollments: [enrollment({ schoolId: "school-1" })] },
    ]);
    prisma.transfer.findMany.mockResolvedValue([]); // no pending transfers
    prisma.studentEnrollment.count.mockResolvedValue(0);
    prisma.studentEnrollment.aggregate.mockResolvedValue({ _max: { rollNumber: null } });
    prisma.studentEnrollment.create.mockResolvedValue({ id: "new-enr-1" });
    prisma.transfer.create.mockResolvedValue({ id: "transfer-1" });
  });

  function dto(overrides: Partial<ConfirmBulkTransferDto> = {}): ConfirmBulkTransferDto {
    return {
      toSchoolId: "school-2",
      toAcademicYearId: "year-2",
      toClassId: "class-2",
      assignments: [{ studentId: "s1", sectionId: "section-2" }],
      ...overrides,
    };
  }

  it("rejects a target class that doesn't belong to the destination school", async () => {
    prisma.class.findFirst.mockResolvedValue(null);
    await expect(service.confirmBulkTransfer(ACTOR, "school-1", dto())).rejects.toThrow(
      "Target class does not belong to the destination school",
    );
  });

  it("rejects the same student being assigned twice", async () => {
    await expect(
      service.confirmBulkTransfer(
        ACTOR,
        "school-1",
        dto({ assignments: [{ studentId: "s1", sectionId: "section-2" }, { studentId: "s1", sectionId: "section-2" }] }),
      ),
    ).rejects.toThrow("The same student can't be assigned twice");
  });

  it("rejects when a target section doesn't belong to the destination class", async () => {
    prisma.section.findMany.mockResolvedValue([]); // no sections match
    await expect(service.confirmBulkTransfer(ACTOR, "school-1", dto())).rejects.toThrow(
      "One or more target sections don't belong to the destination class",
    );
  });

  it("rejects when a student isn't found in the organization", async () => {
    prisma.student.findMany.mockResolvedValue([]);
    await expect(service.confirmBulkTransfer(ACTOR, "school-1", dto())).rejects.toThrow(
      "One or more students were not found in this organization",
    );
  });

  it("rejects a student not currently enrolled at the origin school, naming the student", async () => {
    prisma.student.findMany.mockResolvedValue([{ id: "s1", enrollments: [enrollment({ schoolId: "some-other-school" })] }]);
    await expect(service.confirmBulkTransfer(ACTOR, "school-1", dto())).rejects.toThrow(
      "Student s1 is not currently enrolled at this school",
    );
  });

  it("rejects when any student already has a pending transfer, even if not all do", async () => {
    prisma.transfer.findMany.mockResolvedValue([{ studentId: "s1" }]);
    await expect(service.confirmBulkTransfer(ACTOR, "school-1", dto())).rejects.toThrow(
      "One or more students already have a pending transfer request",
    );
  });

  it("rejects when a target section can't fit the incoming students, aggregating multiple assignments to the same section", async () => {
    prisma.student.findMany.mockResolvedValue([
      { id: "s1", enrollments: [enrollment({ schoolId: "school-1" })] },
      { id: "s2", enrollments: [enrollment({ schoolId: "school-1" })] },
    ]);
    prisma.section.findMany.mockResolvedValue([{ id: "section-2", name: "B", capacity: 1, classId: "class-2" }]);
    prisma.studentEnrollment.count.mockResolvedValue(0);
    await expect(
      service.confirmBulkTransfer(
        ACTOR,
        "school-1",
        dto({ assignments: [{ studentId: "s1", sectionId: "section-2" }, { studentId: "s2", sectionId: "section-2" }] }),
      ),
    ).rejects.toThrow("Section B doesn't have room for 2 more student(s) (capacity 1, currently 0)");
  });

  it("creates each transfer directly as EXECUTED, self-requested-and-approved by the same actor", async () => {
    const result = await service.confirmBulkTransfer(ACTOR, "school-1", dto());
    expect(prisma.transfer.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "EXECUTED", requestedByUserId: ACTOR.id, approvedByUserId: ACTOR.id }),
      }),
    );
    expect(result.results).toHaveLength(1);
  });
});
