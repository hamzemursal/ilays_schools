import { BadRequestException, NotFoundException } from "@nestjs/common";
import type { AuthenticatedUser } from "../auth/types/authenticated-user";
import { PaymentsService } from "./payments.service";
import { PrismaService } from "../prisma/prisma.service";
import { SchoolsService } from "../schools/schools.service";
import { AuditService } from "../audit/audit.service";

const ACTOR: AuthenticatedUser = {
  id: "user-1",
  email: "finance@example.com",
  organizationId: "org-1",
  roles: ["FINANCE_STAFF"],
  permissions: ["finance.payments.reverse"],
  schoolIds: ["school-1"],
};

describe("PaymentsService.reverse", () => {
  let prisma: {
    payment: { findUnique: jest.Mock; update: jest.Mock };
    studentEnrollment: { findUniqueOrThrow: jest.Mock };
    invoice: { update: jest.Mock };
    charge: { update: jest.Mock };
    $transaction: jest.Mock;
  };
  let schools: { findOneAccessibleOrThrow: jest.Mock };
  let audit: { record: jest.Mock };
  let service: PaymentsService;

  beforeEach(() => {
    prisma = {
      payment: { findUnique: jest.fn(), update: jest.fn() },
      studentEnrollment: { findUniqueOrThrow: jest.fn() },
      invoice: { update: jest.fn() },
      charge: { update: jest.fn() },
      $transaction: jest.fn((cb: (tx: unknown) => unknown) => cb(prisma)),
    };
    schools = { findOneAccessibleOrThrow: jest.fn().mockResolvedValue(undefined) };
    audit = { record: jest.fn().mockResolvedValue(undefined) };
    service = new PaymentsService(
      prisma as unknown as PrismaService,
      schools as unknown as SchoolsService,
      audit as unknown as AuditService,
    );
  });

  it("throws NotFoundException for a payment that doesn't exist", async () => {
    prisma.payment.findUnique.mockResolvedValue(null);

    await expect(service.reverse(ACTOR, "pay-x", { reason: "duplicate" })).rejects.toThrow(NotFoundException);
  });

  it("refuses to reverse an already-reversed payment", async () => {
    prisma.payment.findUnique.mockResolvedValue({
      id: "pay-1",
      status: "REVERSED",
      invoice: null,
      charge: { schoolId: "school-1", payments: [] },
    });

    await expect(service.reverse(ACTOR, "pay-1", { reason: "duplicate" })).rejects.toThrow(BadRequestException);
    expect(prisma.payment.update).not.toHaveBeenCalled();
  });

  it("drops a charge back to OUTSTANDING when its only posted payment is reversed", async () => {
    prisma.payment.findUnique.mockResolvedValue({
      id: "pay-1",
      status: "POSTED",
      invoice: null,
      charge: { id: "chg-1", schoolId: "school-1", amount: "100.00", payments: [{ id: "pay-1", status: "POSTED", amount: "100.00" }] },
    });
    prisma.payment.update.mockResolvedValue({ id: "pay-1", status: "REVERSED" });

    await service.reverse(ACTOR, "pay-1", { reason: "duplicate charge" });

    expect(prisma.charge.update).toHaveBeenCalledWith({ where: { id: "chg-1" }, data: { status: "OUTSTANDING" } });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: "PAYMENT_REVERSED", severity: "WARNING" }),
      prisma,
    );
  });

  it("drops an invoice from PAID to PARTIALLY_PAID when one of two posted payments is reversed", async () => {
    prisma.payment.findUnique.mockResolvedValue({
      id: "pay-2",
      status: "POSTED",
      invoice: {
        id: "inv-1",
        enrollmentId: "enrollment-1",
        amount: "100.00",
        payments: [
          { id: "pay-1", status: "POSTED", amount: "60.00" },
          { id: "pay-2", status: "POSTED", amount: "40.00" },
        ],
      },
      charge: null,
    });
    prisma.studentEnrollment.findUniqueOrThrow.mockResolvedValue({ schoolId: "school-1" });
    prisma.payment.update.mockResolvedValue({ id: "pay-2", status: "REVERSED" });

    await service.reverse(ACTOR, "pay-2", { reason: "bank reversal" });

    expect(prisma.invoice.update).toHaveBeenCalledWith({ where: { id: "inv-1" }, data: { status: "PARTIALLY_PAID" } });
  });
});
