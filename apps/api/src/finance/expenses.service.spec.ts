import { BadRequestException, NotFoundException } from "@nestjs/common";
import type { AuthenticatedUser } from "../auth/types/authenticated-user";
import { ExpensesService } from "./expenses.service";
import { PrismaService } from "../prisma/prisma.service";
import { SchoolsService } from "../schools/schools.service";
import { AuditService } from "../audit/audit.service";

const ACTOR: AuthenticatedUser = {
  id: "user-1",
  email: "finance@example.com",
  organizationId: "org-1",
  roles: ["FINANCE_STAFF"],
  permissions: ["expenses.approve"],
  schoolIds: ["school-1"],
};

describe("ExpensesService", () => {
  let prisma: {
    expenseCategory: { findFirst: jest.Mock };
    expense: { create: jest.Mock; findFirst: jest.Mock; update: jest.Mock };
  };
  let schools: { findOneAccessibleOrThrow: jest.Mock };
  let audit: { record: jest.Mock };
  let service: ExpensesService;

  beforeEach(() => {
    prisma = {
      expenseCategory: { findFirst: jest.fn() },
      expense: { create: jest.fn(), findFirst: jest.fn(), update: jest.fn() },
    };
    schools = { findOneAccessibleOrThrow: jest.fn().mockResolvedValue(undefined) };
    audit = { record: jest.fn().mockResolvedValue(undefined) };
    service = new ExpensesService(
      prisma as unknown as PrismaService,
      schools as unknown as SchoolsService,
      audit as unknown as AuditService,
    );
  });

  it("creates a PENDING expense and rejects a category from another school", async () => {
    prisma.expenseCategory.findFirst.mockResolvedValue(null);

    await expect(
      service.create(ACTOR, "school-1", {
        expenseCategoryId: "cat-other-school",
        description: "Supplies",
        amount: 50,
        expenseDate: "2027-01-01",
      }),
    ).rejects.toThrow(BadRequestException);
    expect(prisma.expense.create).not.toHaveBeenCalled();
  });

  it("approves a PENDING expense and records who/when", async () => {
    prisma.expense.findFirst.mockResolvedValue({ id: "exp-1", status: "PENDING", description: "Supplies" });
    prisma.expense.update.mockResolvedValue({ id: "exp-1", status: "APPROVED" });

    await service.approve(ACTOR, "school-1", "exp-1");

    expect(prisma.expense.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "APPROVED", approvedByUserId: "user-1" }) }),
    );
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: "EXPENSE_APPROVED" }));
  });

  it("refuses to approve an expense that isn't PENDING", async () => {
    prisma.expense.findFirst.mockResolvedValue({ id: "exp-1", status: "APPROVED" });

    await expect(service.approve(ACTOR, "school-1", "exp-1")).rejects.toThrow(BadRequestException);
    expect(prisma.expense.update).not.toHaveBeenCalled();
  });

  it("refuses to mark an expense paid unless it is APPROVED", async () => {
    prisma.expense.findFirst.mockResolvedValue({ id: "exp-1", status: "PENDING" });

    await expect(service.markPaid(ACTOR, "school-1", "exp-1")).rejects.toThrow(BadRequestException);
  });

  it("marks an APPROVED expense as PAID", async () => {
    prisma.expense.findFirst.mockResolvedValue({ id: "exp-1", status: "APPROVED", description: "Supplies" });
    prisma.expense.update.mockResolvedValue({ id: "exp-1", status: "PAID" });

    await service.markPaid(ACTOR, "school-1", "exp-1");

    expect(prisma.expense.update).toHaveBeenCalledWith(expect.objectContaining({ data: { status: "PAID" } }));
  });

  it("carries the rejection reason into the audit record even though Expense has no rejectionReason column", async () => {
    prisma.expense.findFirst.mockResolvedValue({ id: "exp-1", status: "PENDING", description: "Supplies" });
    prisma.expense.update.mockResolvedValue({ id: "exp-1", status: "REJECTED" });

    await service.reject(ACTOR, "school-1", "exp-1", { reason: "no receipt" });

    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: "EXPENSE_REJECTED", reason: "no receipt" }));
  });

  it("throws NotFoundException for an expense outside this school", async () => {
    prisma.expense.findFirst.mockResolvedValue(null);

    await expect(service.approve(ACTOR, "school-1", "exp-x")).rejects.toThrow(NotFoundException);
  });
});
