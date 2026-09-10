import { BadRequestException, ConflictException } from "@nestjs/common";
import { Prisma } from "@school-erp/database";
import type { AuthenticatedUser } from "../auth/types/authenticated-user";
import { PaymentSubmissionsService } from "./payment-submissions.service";
import { PrismaService } from "../prisma/prisma.service";
import { SchoolsService } from "../schools/schools.service";
import { GuardiansService } from "../guardians/guardians.service";
import { NotificationsService } from "../notifications/notifications.service";
import { AuditService } from "../audit/audit.service";

const FINANCE_ACTOR: AuthenticatedUser = {
  id: "finance-1",
  email: "finance@example.com",
  organizationId: "org-1",
  roles: ["FINANCE_STAFF"],
  permissions: ["finance.payments.verify"],
  schoolIds: ["school-1"],
};

const GUARDIAN_ACTOR: AuthenticatedUser = {
  id: "guardian-user-1",
  email: "parent@example.com",
  organizationId: "org-1",
  roles: ["PARENT"],
  permissions: [],
  schoolIds: [],
};

function uniqueViolation() {
  return new Prisma.PrismaClientKnownRequestError("Unique constraint failed", { code: "P2002", clientVersion: "test" });
}

describe("PaymentSubmissionsService", () => {
  let prisma: {
    paymentSubmission: { create: jest.Mock; findFirst: jest.Mock; findMany: jest.Mock; update: jest.Mock };
    studentEnrollment: { findFirst: jest.Mock };
    studentGuardian: { findMany: jest.Mock };
    invoice: { findFirst: jest.Mock; update: jest.Mock };
    charge: { findFirst: jest.Mock; update: jest.Mock };
    payment: { create: jest.Mock };
    $transaction: jest.Mock;
  };
  let schools: { findOneAccessibleOrThrow: jest.Mock };
  let guardians: { assertGuardianCanAccessStudent: jest.Mock; getSelfGuardianOrThrow: jest.Mock };
  let notifications: { notifyGuardian: jest.Mock };
  let audit: { record: jest.Mock };
  let service: PaymentSubmissionsService;

  beforeEach(() => {
    prisma = {
      paymentSubmission: { create: jest.fn(), findFirst: jest.fn(), findMany: jest.fn(), update: jest.fn() },
      studentEnrollment: { findFirst: jest.fn() },
      studentGuardian: { findMany: jest.fn().mockResolvedValue([]) },
      invoice: { findFirst: jest.fn(), update: jest.fn() },
      charge: { findFirst: jest.fn(), update: jest.fn() },
      payment: { create: jest.fn() },
      $transaction: jest.fn((cb: (tx: unknown) => unknown) => cb(prisma)),
    };
    schools = { findOneAccessibleOrThrow: jest.fn().mockResolvedValue(undefined) };
    guardians = {
      assertGuardianCanAccessStudent: jest.fn().mockResolvedValue(undefined),
      getSelfGuardianOrThrow: jest.fn(),
    };
    notifications = { notifyGuardian: jest.fn().mockResolvedValue(undefined) };
    audit = { record: jest.fn().mockResolvedValue(undefined) };
    service = new PaymentSubmissionsService(
      prisma as unknown as PrismaService,
      schools as unknown as SchoolsService,
      guardians as unknown as GuardiansService,
      notifications as unknown as NotificationsService,
      audit as unknown as AuditService,
    );
  });

  describe("submitFromGuardian", () => {
    it("checks guardian access and derives schoolId from the student's current enrollment", async () => {
      prisma.studentEnrollment.findFirst.mockResolvedValue({ schoolId: "school-derived" });
      prisma.paymentSubmission.create.mockResolvedValue({ id: "sub-1", provider: "ZAAD" });

      await service.submitFromGuardian(GUARDIAN_ACTOR, "student-1", { amount: 25 });

      expect(guardians.assertGuardianCanAccessStudent).toHaveBeenCalledWith(GUARDIAN_ACTOR, "student-1");
      expect(prisma.paymentSubmission.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ schoolId: "school-derived", submittedByUserId: "guardian-user-1" }),
        }),
      );
    });

    it("rejects a student with no active enrollment anywhere", async () => {
      prisma.studentEnrollment.findFirst.mockResolvedValue(null);

      await expect(service.submitFromGuardian(GUARDIAN_ACTOR, "student-1", { amount: 25 })).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe("submitFromFinance", () => {
    it("rejects a student with no active enrollment in this specific school", async () => {
      prisma.studentEnrollment.findFirst.mockResolvedValue(null);

      await expect(service.submitFromFinance(FINANCE_ACTOR, "school-1", "student-1", { amount: 25 })).rejects.toThrow(
        BadRequestException,
      );
    });

    it("leaves submittedByUserId null for a Finance-discovered direct deposit", async () => {
      prisma.studentEnrollment.findFirst.mockResolvedValue({ id: "enrollment-1" });
      prisma.paymentSubmission.create.mockResolvedValue({ id: "sub-1", provider: "ZAAD" });

      await service.submitFromFinance(FINANCE_ACTOR, "school-1", "student-1", { amount: 25 });

      expect(prisma.paymentSubmission.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ submittedByUserId: null }) }),
      );
    });
  });

  it("rejects a create naming both invoiceId and chargeId", async () => {
    prisma.studentEnrollment.findFirst.mockResolvedValue({ id: "enrollment-1" });

    await expect(
      service.submitFromFinance(FINANCE_ACTOR, "school-1", "student-1", { amount: 25, invoiceId: "inv-1", chargeId: "chg-1" }),
    ).rejects.toThrow(BadRequestException);
    expect(prisma.paymentSubmission.create).not.toHaveBeenCalled();
  });

  it("surfaces a duplicate providerTransactionReference as ConflictException", async () => {
    prisma.studentEnrollment.findFirst.mockResolvedValue({ id: "enrollment-1" });
    prisma.paymentSubmission.create.mockRejectedValue(uniqueViolation());

    await expect(
      service.submitFromFinance(FINANCE_ACTOR, "school-1", "student-1", { amount: 25, providerTransactionReference: "ZD123" }),
    ).rejects.toThrow(ConflictException);
  });

  describe("verify", () => {
    it("refuses to verify a submission not matched to an invoice or charge", async () => {
      prisma.paymentSubmission.findFirst.mockResolvedValue({
        id: "sub-1",
        status: "PENDING",
        invoiceId: null,
        chargeId: null,
        amount: "25.00",
      });

      await expect(service.verify(FINANCE_ACTOR, "school-1", "sub-1", {})).rejects.toThrow(BadRequestException);
      expect(prisma.payment.create).not.toHaveBeenCalled();
    });

    it("refuses to verify a submission that has already been decided", async () => {
      prisma.paymentSubmission.findFirst.mockResolvedValue({ id: "sub-1", status: "VERIFIED" });

      await expect(service.verify(FINANCE_ACTOR, "school-1", "sub-1", { chargeId: "chg-1" })).rejects.toThrow(
        BadRequestException,
      );
    });

    it("rejects a submission amount exceeding the matched charge's remaining balance", async () => {
      prisma.paymentSubmission.findFirst.mockResolvedValue({ id: "sub-1", status: "PENDING", invoiceId: null, chargeId: null, amount: "80.00" });
      prisma.charge.findFirst.mockResolvedValue({ id: "chg-1", amount: "100.00", payments: [{ status: "POSTED", amount: "50.00" }] });

      // remaining = 100 - 50 = 50; an 80 submission must be rejected
      await expect(service.verify(FINANCE_ACTOR, "school-1", "sub-1", { chargeId: "chg-1" })).rejects.toThrow(
        BadRequestException,
      );
      expect(prisma.payment.create).not.toHaveBeenCalled();
    });

    it("posts a real Payment linked back to the submission and marks it VERIFIED", async () => {
      prisma.paymentSubmission.findFirst.mockResolvedValue({ id: "sub-1", status: "PENDING", invoiceId: null, chargeId: null, amount: "40.00", providerTransactionReference: "ZD123" });
      prisma.charge.findFirst.mockResolvedValue({ id: "chg-1", amount: "100.00", payments: [] });
      prisma.payment.create.mockResolvedValue({ id: "pay-1" });
      prisma.paymentSubmission.update.mockResolvedValue({ id: "sub-1", status: "VERIFIED" });

      await service.verify(FINANCE_ACTOR, "school-1", "sub-1", { chargeId: "chg-1" });

      expect(prisma.payment.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ chargeId: "chg-1", method: "MOBILE_MONEY", paymentSubmissionId: "sub-1", reference: "ZD123" }),
        }),
      );
      expect(prisma.paymentSubmission.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: "VERIFIED", chargeId: "chg-1" }) }),
      );
    });

    it("notifies every active guardian of the student once verified", async () => {
      prisma.paymentSubmission.findFirst.mockResolvedValue({ id: "sub-1", studentId: "student-1", status: "PENDING", invoiceId: null, chargeId: null, amount: "40.00" });
      prisma.charge.findFirst.mockResolvedValue({ id: "chg-1", amount: "100.00", payments: [] });
      prisma.payment.create.mockResolvedValue({ id: "pay-1" });
      prisma.paymentSubmission.update.mockResolvedValue({ id: "sub-1", status: "VERIFIED" });
      prisma.studentGuardian.findMany.mockResolvedValue([{ guardianId: "g1" }, { guardianId: "g2" }]);

      await service.verify(FINANCE_ACTOR, "school-1", "sub-1", { chargeId: "chg-1" });

      expect(prisma.studentGuardian.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { studentId: "student-1", status: "ACTIVE" } }),
      );
      expect(notifications.notifyGuardian).toHaveBeenCalledTimes(2);
      expect(notifications.notifyGuardian).toHaveBeenCalledWith("g1", expect.objectContaining({ title: "Payment verified" }));
      expect(notifications.notifyGuardian).toHaveBeenCalledWith("g2", expect.objectContaining({ title: "Payment verified" }));
    });
  });

  describe("reject", () => {
    it("never creates a Payment — a rejected submission must not affect any balance", async () => {
      prisma.paymentSubmission.findFirst.mockResolvedValue({ id: "sub-1", status: "PENDING" });
      prisma.paymentSubmission.update.mockResolvedValue({ id: "sub-1", status: "REJECTED" });

      await service.reject(FINANCE_ACTOR, "school-1", "sub-1", { reason: "transaction not found" });

      expect(prisma.payment.create).not.toHaveBeenCalled();
      expect(prisma.paymentSubmission.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: "REJECTED", rejectionReason: "transaction not found" }) }),
      );
    });

    it("notifies every active guardian of the student with the rejection reason", async () => {
      prisma.paymentSubmission.findFirst.mockResolvedValue({ id: "sub-1", studentId: "student-1", status: "PENDING", amount: "15.00" });
      prisma.paymentSubmission.update.mockResolvedValue({ id: "sub-1", status: "REJECTED" });
      prisma.studentGuardian.findMany.mockResolvedValue([{ guardianId: "g1" }]);

      await service.reject(FINANCE_ACTOR, "school-1", "sub-1", { reason: "transaction not found" });

      expect(notifications.notifyGuardian).toHaveBeenCalledWith(
        "g1",
        expect.objectContaining({ title: "Payment rejected", body: expect.stringContaining("transaction not found") }),
      );
    });

    it("refuses to reject a submission that has already been decided", async () => {
      prisma.paymentSubmission.findFirst.mockResolvedValue({ id: "sub-1", status: "REJECTED" });

      await expect(service.reject(FINANCE_ACTOR, "school-1", "sub-1", { reason: "again" })).rejects.toThrow(
        BadRequestException,
      );
    });
  });
});
