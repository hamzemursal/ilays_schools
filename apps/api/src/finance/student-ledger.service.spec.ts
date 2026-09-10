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
