import { BadRequestException, ConflictException, NotFoundException } from "@nestjs/common";
import { Prisma } from "@school-erp/database";
import type { AuthenticatedUser } from "../auth/types/authenticated-user";
import { PayslipsService } from "./payslips.service";
import { PrismaService } from "../prisma/prisma.service";
import { SchoolsService } from "../schools/schools.service";
import { SalaryHistoryService } from "./salary-history.service";
import { NotificationsService } from "../notifications/notifications.service";
import { AuditService } from "../audit/audit.service";

const ACTOR: AuthenticatedUser = {
  id: "user-1",
  email: "finance@example.com",
  organizationId: "org-1",
  roles: ["FINANCE_STAFF"],
  permissions: ["payroll.prepare"],
  schoolIds: ["school-1"],
};

function uniqueViolation() {
  return new Prisma.PrismaClientKnownRequestError("Unique constraint failed", { code: "P2002", clientVersion: "test" });
}

describe("PayslipsService", () => {
  let prisma: {
    payrollPeriod: { findFirst: jest.Mock };
    teacher: { findFirst: jest.Mock };
    staff: { findFirst: jest.Mock };
    payslip: { create: jest.Mock; findFirst: jest.Mock; update: jest.Mock };
    payslipLineItem: { findMany: jest.Mock; create: jest.Mock };
    staffAdvance: { findMany: jest.Mock; update: jest.Mock };
    advanceRepayment: { create: jest.Mock };
    $transaction: jest.Mock;
  };
  let schools: { findOneAccessibleOrThrow: jest.Mock };
  let salaryHistory: { getCurrent: jest.Mock };
  let notifications: { notifyUser: jest.Mock };
  let audit: { record: jest.Mock };
  let service: PayslipsService;

  beforeEach(() => {
    prisma = {
      payrollPeriod: { findFirst: jest.fn() },
      teacher: { findFirst: jest.fn() },
      staff: { findFirst: jest.fn().mockResolvedValue({ id: "staff-1" }) },
      payslip: { create: jest.fn(), findFirst: jest.fn(), update: jest.fn() },
      payslipLineItem: { findMany: jest.fn().mockResolvedValue([]), create: jest.fn() },
      staffAdvance: { findMany: jest.fn().mockResolvedValue([]), update: jest.fn() },
      advanceRepayment: { create: jest.fn() },
      $transaction: jest.fn((cb: (tx: unknown) => unknown) => cb(prisma)),
    };
    schools = { findOneAccessibleOrThrow: jest.fn().mockResolvedValue(undefined) };
    salaryHistory = { getCurrent: jest.fn() };
    notifications = { notifyUser: jest.fn().mockResolvedValue(undefined) };
    audit = { record: jest.fn().mockResolvedValue(undefined) };
    service = new PayslipsService(
      prisma as unknown as PrismaService,
      schools as unknown as SchoolsService,
      salaryHistory as unknown as SalaryHistoryService,
      notifications as unknown as NotificationsService,
      audit as unknown as AuditService,
    );
  });

  describe("create", () => {
    it("rejects creating a payslip in a CLOSED payroll period", async () => {
      prisma.payrollPeriod.findFirst.mockResolvedValue({ id: "period-1", status: "CLOSED" });

      await expect(service.create(ACTOR, "school-1", "period-1", { staffId: "staff-1" })).rejects.toThrow(
        BadRequestException,
      );
    });

    it("pulls basicSalary from current SalaryHistory when none is given", async () => {
      prisma.payrollPeriod.findFirst.mockResolvedValue({ id: "period-1", status: "OPEN" });
      salaryHistory.getCurrent.mockResolvedValue({ basicSalary: "300.00" });
      prisma.payslip.create.mockResolvedValue({ id: "payslip-1" });

      await service.create(ACTOR, "school-1", "period-1", { staffId: "staff-1" });

      expect(prisma.payslip.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ basicSalary: 300 }) }),
      );
    });

    it("rejects an employee with no salary on file and no basicSalary override", async () => {
      prisma.payrollPeriod.findFirst.mockResolvedValue({ id: "period-1", status: "OPEN" });
      salaryHistory.getCurrent.mockResolvedValue(null);

      await expect(service.create(ACTOR, "school-1", "period-1", { staffId: "staff-1" })).rejects.toThrow(
        BadRequestException,
      );
      expect(prisma.payslip.create).not.toHaveBeenCalled();
    });

    it("surfaces a duplicate (period, employee) payslip as ConflictException", async () => {
      prisma.payrollPeriod.findFirst.mockResolvedValue({ id: "period-1", status: "OPEN" });
      prisma.payslip.create.mockRejectedValue(uniqueViolation());

      await expect(
        service.create(ACTOR, "school-1", "period-1", { staffId: "staff-1", basicSalary: 300 }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe("calculate", () => {
    it("computes gross/net matching the worked example: 300 basic + 50 + 30 + 20 - 20 deduction - 50 advance = net 330", async () => {
      prisma.payslip.findFirst.mockResolvedValue({
        id: "payslip-1",
        status: "DRAFT",
        basicSalary: "300.00",
        teacherId: null,
        staffId: "staff-1",
      });
      prisma.payslipLineItem.findMany.mockResolvedValue([
        { type: "ALLOWANCE", amount: "50.00" },
        { type: "ALLOWANCE", amount: "30.00" },
        { type: "BONUS", amount: "20.00" },
        { type: "DEDUCTION", amount: "20.00" },
      ]);
      prisma.staffAdvance.findMany.mockResolvedValue([
        { id: "adv-1", amount: "100.00", repaymentPerPeriod: "50.00", repayments: [] },
      ]);
      prisma.payslip.update.mockResolvedValue({ id: "payslip-1", grossSalary: "400", netSalary: "330" });

      await service.calculate(ACTOR, "school-1", "payslip-1");

      expect(prisma.advanceRepayment.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ staffAdvanceId: "adv-1", payslipId: "payslip-1" }) }),
      );
      const advanceRepaymentAmount = prisma.advanceRepayment.create.mock.calls[0][0].data.amount;
      expect(advanceRepaymentAmount.toNumber()).toBe(50);

      expect(prisma.payslip.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: "CALCULATED" }),
        }),
      );
      const updateData = prisma.payslip.update.mock.calls[0][0].data;
      expect(updateData.grossSalary.toNumber()).toBe(400);
      expect(updateData.netSalary.toNumber()).toBe(330);
    });

    it("caps the advance installment at the remaining balance and closes the advance when fully repaid", async () => {
      prisma.payslip.findFirst.mockResolvedValue({ id: "payslip-1", status: "DRAFT", basicSalary: "300.00", teacherId: null, staffId: "staff-1" });
      prisma.staffAdvance.findMany.mockResolvedValue([
        // repaymentPerPeriod (50) exceeds the remaining balance (20) — only 20 should be taken
        { id: "adv-1", amount: "100.00", repaymentPerPeriod: "50.00", repayments: [{ amount: "80.00" }] },
      ]);
      prisma.payslip.update.mockResolvedValue({ id: "payslip-1" });

      await service.calculate(ACTOR, "school-1", "payslip-1");

      expect(prisma.advanceRepayment.create.mock.calls[0][0].data.amount.toNumber()).toBe(20);
      expect(prisma.staffAdvance.update).toHaveBeenCalledWith({ where: { id: "adv-1" }, data: { status: "COMPLETED" } });
    });

    it("refuses to calculate a payslip that isn't DRAFT", async () => {
      prisma.payslip.findFirst.mockResolvedValue({ id: "payslip-1", status: "CALCULATED" });

      await expect(service.calculate(ACTOR, "school-1", "payslip-1")).rejects.toThrow(BadRequestException);
    });
  });

  describe("workflow transitions", () => {
    it("refuses to approve a payslip that hasn't been reviewed yet", async () => {
      prisma.payslip.findFirst.mockResolvedValue({ id: "payslip-1", status: "CALCULATED" });

      await expect(service.approve(ACTOR, "school-1", "payslip-1")).rejects.toThrow(BadRequestException);
      expect(prisma.payslip.update).not.toHaveBeenCalled();
    });

    it("refuses to pay a payslip that hasn't been approved yet", async () => {
      prisma.payslip.findFirst.mockResolvedValue({ id: "payslip-1", status: "REVIEWED" });

      await expect(service.pay(ACTOR, "school-1", "payslip-1")).rejects.toThrow(BadRequestException);
    });

    it("throws NotFoundException reviewing a payslip outside this school", async () => {
      prisma.payslip.findFirst.mockResolvedValue(null);

      await expect(service.review(ACTOR, "school-1", "payslip-x")).rejects.toThrow(NotFoundException);
    });

    it("notifies the staff member's own portal account once paid", async () => {
      prisma.payslip.findFirst.mockResolvedValue({ id: "payslip-1", status: "APPROVED" });
      prisma.payslip.update.mockResolvedValue({ id: "payslip-1", status: "PAID", teacherId: null, staffId: "staff-1", netSalary: "500.00" });
      prisma.staff.findFirst.mockResolvedValue({ userId: "staff-user-1" });

      await service.pay(ACTOR, "school-1", "payslip-1");

      expect(notifications.notifyUser).toHaveBeenCalledWith(
        "staff-user-1",
        expect.objectContaining({ title: "Payslip paid", body: expect.stringContaining("500.00") }),
      );
    });

    it("advances REVIEWED -> APPROVED and records who/when", async () => {
      prisma.payslip.findFirst.mockResolvedValue({ id: "payslip-1", status: "REVIEWED" });
      prisma.payslip.update.mockResolvedValue({ id: "payslip-1", status: "APPROVED" });

      await service.approve(ACTOR, "school-1", "payslip-1");

      expect(prisma.payslip.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: "APPROVED", approvedByUserId: "user-1" }),
        }),
      );
    });
  });

  it("rejects adding an ADVANCE_REPAYMENT line item manually", async () => {
    prisma.payslip.findFirst.mockResolvedValue({ id: "payslip-1", status: "DRAFT" });

    await expect(
      service.addLineItem(ACTOR, "school-1", "payslip-1", { type: "ADVANCE_REPAYMENT", label: "x", amount: 10 }),
    ).rejects.toThrow(BadRequestException);
    expect(prisma.payslipLineItem.create).not.toHaveBeenCalled();
  });
});
