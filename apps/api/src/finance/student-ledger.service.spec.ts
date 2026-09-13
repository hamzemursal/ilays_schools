import type { AuthenticatedUser } from "../auth/types/authenticated-user";
import { StudentLedgerService } from "./student-ledger.service";
import { PrismaService } from "../prisma/prisma.service";
import { StudentsService } from "../students/students.service";

const ACTOR: AuthenticatedUser = {
  id: "user-1",
  email: "accountant@example.com",
  organizationId: "org-1",
  roles: ["ACCOUNTANT"],
  permissions: ["finance.ledger.view"],
  schoolIds: ["school-1"],
};

describe("StudentLedgerService.getLedger", () => {
  let prisma: {
    studentEnrollment: { findMany: jest.Mock };
    invoice: { findMany: jest.Mock };
    charge: { findMany: jest.Mock };
    feeAdjustment: { findMany: jest.Mock };
  };
  let students: { assertAccessibleStudent: jest.Mock };
  let service: StudentLedgerService;

  beforeEach(() => {
    prisma = {
      studentEnrollment: { findMany: jest.fn().mockResolvedValue([{ id: "enrollment-1" }]) },
      invoice: { findMany: jest.fn().mockResolvedValue([]) },
      charge: { findMany: jest.fn().mockResolvedValue([]) },
      feeAdjustment: { findMany: jest.fn().mockResolvedValue([]) },
    };
    students = { assertAccessibleStudent: jest.fn().mockResolvedValue(undefined) };
    service = new StudentLedgerService(prisma as unknown as PrismaService, students as unknown as StudentsService);
  });

  it("derives balance as charged minus posted payments minus approved adjustments", async () => {
    prisma.invoice.findMany.mockResolvedValue([
      {
        id: "inv-1",
        amount: "300.00",
        status: "PARTIALLY_PAID",
        dueDate: null,
        feeStructure: { id: "fs-1", name: "Tuition" },
        payments: [
          { status: "POSTED", amount: "100.00" },
          { status: "REVERSED", amount: "50.00" }, // must never count toward totalPaid
        ],
      },
    ]);
    prisma.charge.findMany.mockResolvedValue([
      {
        id: "chg-1",
        amount: "50.00",
        status: "OUTSTANDING",
        dueDate: null,
        feeStructure: { id: "fs-2", name: "January fee" },
        billingPeriod: { id: "bp-1", name: "January 2027" },
        payments: [],
      },
    ]);
    prisma.feeAdjustment.findMany.mockResolvedValue([
      { status: "APPROVED", amount: "20.00" },
      { status: "PENDING", amount: "999.00" }, // must never affect the balance
    ]);

    const result = await service.getLedger(ACTOR, "student-1");

    // totalCharged = 300 + 50 = 350; totalPaid = 100 (REVERSED excluded);
    // totalAdjustments = 20 (PENDING excluded); balance = 350 - 100 - 20 = 230
    expect(result.summary).toEqual({ totalCharged: 350, totalPaid: 100, totalAdjustments: 20, balance: 230 });
  });

  it("scopes enrollments to the actor's accessible schools before querying invoices/charges", async () => {
    await service.getLedger(ACTOR, "student-1");

    expect(students.assertAccessibleStudent).toHaveBeenCalledWith(ACTOR, "student-1");
    expect(prisma.studentEnrollment.findMany).toHaveBeenCalledWith({
      where: { studentId: "student-1", schoolId: { in: ["school-1"] } },
      select: { id: true },
    });
    expect(prisma.invoice.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { enrollmentId: { in: ["enrollment-1"] } } }),
    );
  });

  it("returns a zeroed summary for a student with no financial history", async () => {
    const result = await service.getLedger(ACTOR, "student-1");

    expect(result.summary).toEqual({ totalCharged: 0, totalPaid: 0, totalAdjustments: 0, balance: 0 });
    expect(result.invoices).toEqual([]);
    expect(result.charges).toEqual([]);
  });
});

describe("StudentLedgerService.getSummaryForEnrollments — the Advanced Student List's bulk Fee Status column", () => {
  let prisma: {
    invoice: { findMany: jest.Mock };
    charge: { findMany: jest.Mock };
    feeAdjustment: { findMany: jest.Mock };
  };
  let service: StudentLedgerService;

  beforeEach(() => {
    prisma = {
      invoice: { findMany: jest.fn().mockResolvedValue([]) },
      charge: { findMany: jest.fn().mockResolvedValue([]) },
      feeAdjustment: { findMany: jest.fn().mockResolvedValue([]) },
    };
    service = new StudentLedgerService(prisma as unknown as PrismaService, {} as unknown as StudentsService);
  });

  it("returns an empty map without querying anything for an empty id list", async () => {
    const result = await service.getSummaryForEnrollments([]);
    expect(result.size).toBe(0);
    expect(prisma.invoice.findMany).not.toHaveBeenCalled();
  });

  it("gives every requested enrollment a NO_CHARGE entry even with zero financial history", async () => {
    const result = await service.getSummaryForEnrollments(["enr-1", "enr-2"]);
    expect(result.get("enr-1")).toEqual({ totalCharged: 0, totalPaid: 0, balance: 0, feeStatus: "NO_CHARGE", lastPaymentDate: null });
    expect(result.get("enr-2")).toEqual({ totalCharged: 0, totalPaid: 0, balance: 0, feeStatus: "NO_CHARGE", lastPaymentDate: null });
  });

  it("marks PAID once posted payments cover the full charged amount", async () => {
    prisma.invoice.findMany.mockResolvedValue([
      { enrollmentId: "enr-1", amount: "100.00", dueDate: null, payments: [{ amount: "100.00", paidAt: new Date("2027-01-05") }] },
    ]);
    const result = await service.getSummaryForEnrollments(["enr-1"]);
    expect(result.get("enr-1")).toMatchObject({ totalCharged: 100, totalPaid: 100, balance: 0, feeStatus: "PAID" });
    expect(result.get("enr-1")!.lastPaymentDate).toEqual(new Date("2027-01-05"));
  });

  it("marks PARTIALLY_PAID when some but not all of the balance has been paid and nothing is overdue", async () => {
    prisma.invoice.findMany.mockResolvedValue([
      { enrollmentId: "enr-1", amount: "100.00", dueDate: null, payments: [{ amount: "40.00", paidAt: new Date("2027-01-05") }] },
    ]);
    const result = await service.getSummaryForEnrollments(["enr-1"]);
    expect(result.get("enr-1")).toMatchObject({ totalCharged: 100, totalPaid: 40, balance: 60, feeStatus: "PARTIALLY_PAID" });
  });

  it("marks PENDING when nothing has been paid yet and the due date hasn't passed", async () => {
    const future = new Date();
    future.setFullYear(future.getFullYear() + 1);
    prisma.invoice.findMany.mockResolvedValue([{ enrollmentId: "enr-1", amount: "100.00", dueDate: future, payments: [] }]);
    const result = await service.getSummaryForEnrollments(["enr-1"]);
    expect(result.get("enr-1")!.feeStatus).toBe("PENDING");
  });

  it("marks OVERDUE when an unpaid invoice's due date has already passed", async () => {
    prisma.invoice.findMany.mockResolvedValue([
      { enrollmentId: "enr-1", amount: "100.00", dueDate: new Date("2020-01-01"), payments: [] },
    ]);
    const result = await service.getSummaryForEnrollments(["enr-1"]);
    expect(result.get("enr-1")!.feeStatus).toBe("OVERDUE");
  });

  it("excludes CANCELLED charges from totalCharged", async () => {
    prisma.charge.findMany.mockResolvedValue([
      { enrollmentId: "enr-1", amount: "500.00", dueDate: null, status: "CANCELLED", payments: [] },
    ]);
    const result = await service.getSummaryForEnrollments(["enr-1"]);
    expect(result.get("enr-1")).toMatchObject({ totalCharged: 0, feeStatus: "NO_CHARGE" });
  });

  it("reduces the balance by approved adjustments without counting them as a payment", async () => {
    prisma.invoice.findMany.mockResolvedValue([{ enrollmentId: "enr-1", amount: "100.00", dueDate: null, payments: [] }]);
    prisma.feeAdjustment.findMany.mockResolvedValue([{ enrollmentId: "enr-1", amount: "100.00" }]);
    const result = await service.getSummaryForEnrollments(["enr-1"]);
    expect(result.get("enr-1")).toMatchObject({ totalCharged: 100, totalPaid: 0, balance: 0, feeStatus: "PAID" });
  });

  it("combines invoices and charges into one total for the same enrollment", async () => {
    prisma.invoice.findMany.mockResolvedValue([{ enrollmentId: "enr-1", amount: "100.00", dueDate: null, payments: [] }]);
    prisma.charge.findMany.mockResolvedValue([
      { enrollmentId: "enr-1", amount: "50.00", dueDate: null, status: "OUTSTANDING", payments: [] },
    ]);
    const result = await service.getSummaryForEnrollments(["enr-1"]);
    expect(result.get("enr-1")!.totalCharged).toBe(150);
  });
});
