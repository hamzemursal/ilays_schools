import { BadRequestException, NotFoundException } from "@nestjs/common";
import type { AuthenticatedUser } from "../auth/types/authenticated-user";
import { InvoicesService } from "./invoices.service";
import { PrismaService } from "../prisma/prisma.service";
import { SchoolsService } from "../schools/schools.service";
import { StudentsService } from "../students/students.service";
import { AuditService } from "../audit/audit.service";
import type { RecordPaymentDto } from "./dto/record-payment.dto";

const ACTOR: AuthenticatedUser = {
  id: "admin-1",
  email: "admin@example.com",
  organizationId: "org-1",
  roles: ["SCHOOL_ADMIN"],
  permissions: ["payments.record"],
  schoolIds: ["school-1"],
};

type MockPrisma = {
  feeStructure: { findFirst: jest.Mock };
  studentEnrollment: { findMany: jest.Mock };
  invoice: { createMany: jest.Mock; findMany: jest.Mock; findUnique: jest.Mock; update: jest.Mock };
  payment: { create: jest.Mock; findMany: jest.Mock };
  $transaction: jest.Mock;
};

function createMockPrisma(): MockPrisma {
  const prisma: Partial<MockPrisma> = {
    feeStructure: { findFirst: jest.fn() },
    studentEnrollment: { findMany: jest.fn() },
    invoice: { createMany: jest.fn(), findMany: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
    payment: { create: jest.fn(), findMany: jest.fn() },
  };
  prisma.$transaction = jest.fn((cb: (tx: unknown) => unknown) => cb(prisma));
  return prisma as MockPrisma;
}

function createService(prisma: MockPrisma) {
  const schools = { findOneAccessibleOrThrow: jest.fn().mockResolvedValue(undefined) };
  const students = { assertAccessibleStudent: jest.fn().mockResolvedValue(undefined) };
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  const service = new InvoicesService(
    prisma as unknown as PrismaService,
    schools as unknown as SchoolsService,
    students as unknown as StudentsService,
    audit as unknown as AuditService,
  );
  return { service, schools, students, audit };
}

describe("InvoicesService.generateForFeeStructure", () => {
  let prisma: MockPrisma;
  let service: InvoicesService;

  beforeEach(() => {
    prisma = createMockPrisma();
    ({ service } = createService(prisma));
  });

  it("throws NotFoundException when the fee structure isn't in this school", async () => {
    prisma.feeStructure.findFirst.mockResolvedValue(null);
    await expect(service.generateForFeeStructure(ACTOR, "school-1", "fee-1")).rejects.toThrow(NotFoundException);
  });

  it("scopes eligible enrollments to the fee structure's class when classId is set", async () => {
    prisma.feeStructure.findFirst.mockResolvedValue({ id: "fee-1", academicYearId: "year-1", classId: "class-1", amount: "100.00" });
    prisma.studentEnrollment.findMany.mockResolvedValue([]);
    prisma.invoice.createMany.mockResolvedValue({ count: 0 });

    await service.generateForFeeStructure(ACTOR, "school-1", "fee-1");

    expect(prisma.studentEnrollment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { schoolId: "school-1", academicYearId: "year-1", status: "ACTIVE", classId: "class-1" },
      }),
    );
  });

  it("applies to every ACTIVE enrollment in the year when classId is null (school-wide)", async () => {
    prisma.feeStructure.findFirst.mockResolvedValue({ id: "fee-1", academicYearId: "year-1", classId: null, amount: "100.00" });
    prisma.studentEnrollment.findMany.mockResolvedValue([]);
    prisma.invoice.createMany.mockResolvedValue({ count: 0 });

    await service.generateForFeeStructure(ACTOR, "school-1", "fee-1");

    const where = prisma.studentEnrollment.findMany.mock.calls[0][0].where;
    expect(where).not.toHaveProperty("classId");
  });

  it("distinguishes eligibleEnrollments (all matches) from createdCount (only new invoices, via skipDuplicates)", async () => {
    prisma.feeStructure.findFirst.mockResolvedValue({ id: "fee-1", academicYearId: "year-1", classId: null, amount: "100.00" });
    prisma.studentEnrollment.findMany.mockResolvedValue([{ id: "e1" }, { id: "e2" }, { id: "e3" }]);
    // Only 1 of the 3 eligible enrollments actually gets a new row — the
    // other 2 already have this invoice (skipDuplicates silently skips them).
    prisma.invoice.createMany.mockResolvedValue({ count: 1 });

    const result = await service.generateForFeeStructure(ACTOR, "school-1", "fee-1");

    expect(result).toEqual({ createdCount: 1, eligibleEnrollments: 3 });
    expect(prisma.invoice.createMany).toHaveBeenCalledWith(
      expect.objectContaining({ skipDuplicates: true }),
    );
  });
});

describe("InvoicesService.listForStudent — viewpoint scoping", () => {
  let prisma: MockPrisma;
  let service: InvoicesService;
  let students: { assertAccessibleStudent: jest.Mock };

  beforeEach(() => {
    prisma = createMockPrisma();
    prisma.invoice.findMany.mockResolvedValue([]);
    ({ service, students } = createService(prisma));
  });

  it("checks student accessibility, not school accessibility", async () => {
    await service.listForStudent(ACTOR, "student-1");
    expect(students.assertAccessibleStudent).toHaveBeenCalledWith(ACTOR, "student-1");
  });

  it("scopes to the actor's own schoolIds when the actor has any", async () => {
    await service.listForStudent(ACTOR, "student-1");
    expect(prisma.invoice.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { enrollment: { studentId: "student-1", schoolId: { in: ["school-1"] } } },
      }),
    );
  });

  it("omits the schoolId filter entirely for an org-wide actor with no schoolIds", async () => {
    const orgActor: AuthenticatedUser = { ...ACTOR, schoolIds: [] };
    await service.listForStudent(orgActor, "student-1");
    expect(prisma.invoice.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { enrollment: { studentId: "student-1" } } }),
    );
  });
});

describe("InvoicesService.recordPayment", () => {
  let prisma: MockPrisma;
  let service: InvoicesService;
  let audit: { record: jest.Mock };

  beforeEach(() => {
    prisma = createMockPrisma();
    ({ service, audit } = createService(prisma) as unknown as { service: InvoicesService; audit: { record: jest.Mock } });
    prisma.payment.create.mockResolvedValue({ id: "pay-1" });
  });

  function invoice(overrides: Partial<Record<string, unknown>> = {}) {
    return {
      id: "inv-1",
      amount: "100.00",
      enrollment: { schoolId: "school-1" },
      feeStructure: { id: "fee-1" },
      payments: [],
      ...overrides,
    };
  }

  function dto(amount: number, overrides: Partial<RecordPaymentDto> = {}): RecordPaymentDto {
    return { amount, ...overrides } as RecordPaymentDto;
  }

  it("throws NotFoundException for a missing invoice", async () => {
    prisma.invoice.findUnique.mockResolvedValue(null);
    await expect(service.recordPayment(ACTOR, "inv-1", dto(50))).rejects.toThrow(NotFoundException);
  });

  it("rejects a payment exceeding the remaining balance", async () => {
    prisma.invoice.findUnique.mockResolvedValue(invoice({ payments: [{ amount: "60.00" }] }));
    await expect(service.recordPayment(ACTOR, "inv-1", dto(50))).rejects.toThrow(
      "Payment of 50 exceeds the remaining balance of 40.00",
    );
    expect(prisma.payment.create).not.toHaveBeenCalled();
  });

  it("counts a REVERSED payment toward 'already paid' just like a POSTED one — no status filtering in this service", async () => {
    // Documents the real, as-written behavior: unlike ChargesService.recordPayment
    // (which excludes REVERSED payments from the already-paid total),
    // InvoicesService sums every payment regardless of status.
    prisma.invoice.findUnique.mockResolvedValue(
      invoice({ payments: [{ amount: "90.00", status: "REVERSED" }] }),
    );
    await expect(service.recordPayment(ACTOR, "inv-1", dto(20))).rejects.toThrow(
      "Payment of 20 exceeds the remaining balance of 10.00",
    );
  });

  it("marks the invoice PARTIALLY_PAID when the new total is still under the full amount", async () => {
    prisma.invoice.findUnique.mockResolvedValue(invoice({ payments: [] }));
    await service.recordPayment(ACTOR, "inv-1", dto(40));
    expect(prisma.invoice.update).toHaveBeenCalledWith({ where: { id: "inv-1" }, data: { status: "PARTIALLY_PAID" } });
  });

  it("marks the invoice PAID once the new total reaches the full amount", async () => {
    prisma.invoice.findUnique.mockResolvedValue(invoice({ payments: [{ amount: "60.00" }] }));
    await service.recordPayment(ACTOR, "inv-1", dto(40));
    expect(prisma.invoice.update).toHaveBeenCalledWith({ where: { id: "inv-1" }, data: { status: "PAID" } });
  });

  it("records the audit entry inside the same transaction, with the resolved schoolId from the enrollment", async () => {
    prisma.invoice.findUnique.mockResolvedValue(invoice());
    await service.recordPayment(ACTOR, "inv-1", dto(50, { method: "CARD" }));
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        schoolId: "school-1",
        action: "PAYMENT_RECORDED",
        after: expect.objectContaining({ amount: 50, method: "CARD", newStatus: "PARTIALLY_PAID" }),
      }),
      prisma, // the tx passed to the transaction callback
    );
  });

  it("defaults the audited method to CASH when none is given", async () => {
    prisma.invoice.findUnique.mockResolvedValue(invoice());
    await service.recordPayment(ACTOR, "inv-1", dto(10));
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ after: expect.objectContaining({ method: "CASH" }) }),
      prisma,
    );
  });
});

describe("InvoicesService.listPayments / getAccessibleInvoiceOrThrow", () => {
  it("throws NotFoundException for a missing invoice before any access check", async () => {
    const prisma = createMockPrisma();
    prisma.invoice.findUnique.mockResolvedValue(null);
    const { service, schools } = createService(prisma);

    await expect(service.listPayments(ACTOR, "inv-1")).rejects.toThrow(NotFoundException);
    expect(schools.findOneAccessibleOrThrow).not.toHaveBeenCalled();
  });

  it("checks access to the invoice's own school (via its enrollment), not an arbitrary school", async () => {
    const prisma = createMockPrisma();
    prisma.invoice.findUnique.mockResolvedValue({ id: "inv-1", enrollment: { schoolId: "school-9" }, payments: [], feeStructure: {} });
    prisma.payment.findMany.mockResolvedValue([]);
    const { service, schools } = createService(prisma);

    await service.listPayments(ACTOR, "inv-1");

    expect(schools.findOneAccessibleOrThrow).toHaveBeenCalledWith(ACTOR, "school-9");
  });
});
