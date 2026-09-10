import { BadRequestException } from "@nestjs/common";
import type { AuthenticatedUser } from "../auth/types/authenticated-user";
import { FeeAdjustmentsService } from "./fee-adjustments.service";
import { PrismaService } from "../prisma/prisma.service";
import { SchoolsService } from "../schools/schools.service";
import { AuditService } from "../audit/audit.service";

const ACTOR: AuthenticatedUser = {
  id: "user-1",
  email: "finance@example.com",
  organizationId: "org-1",
  roles: ["FINANCE_STAFF"],
  permissions: ["finance.adjustments.manage"],
  schoolIds: ["school-1"],
};

const BASE_DTO = { enrollmentId: "enrollment-1", type: "DISCOUNT" as const, amount: 50, reason: "Sibling discount" };

describe("FeeAdjustmentsService.create", () => {
  let prisma: {
    studentEnrollment: { findFirst: jest.Mock };
    invoice: { findFirst: jest.Mock };
    charge: { findFirst: jest.Mock };
    feeAdjustment: { create: jest.Mock };
  };
  let schools: { findOneAccessibleOrThrow: jest.Mock };
  let audit: { record: jest.Mock };
  let service: FeeAdjustmentsService;

  beforeEach(() => {
    prisma = {
      studentEnrollment: { findFirst: jest.fn().mockResolvedValue({ id: "enrollment-1" }) },
      invoice: { findFirst: jest.fn() },
      charge: { findFirst: jest.fn() },
      feeAdjustment: { create: jest.fn().mockResolvedValue({ id: "adj-1" }) },
    };
    schools = { findOneAccessibleOrThrow: jest.fn().mockResolvedValue(undefined) };
    audit = { record: jest.fn().mockResolvedValue(undefined) };
    service = new FeeAdjustmentsService(
      prisma as unknown as PrismaService,
      schools as unknown as SchoolsService,
      audit as unknown as AuditService,
    );
  });

  it("rejects naming both an invoiceId and a chargeId", async () => {
    await expect(
      service.create(ACTOR, "school-1", { ...BASE_DTO, invoiceId: "inv-1", chargeId: "chg-1" }),
    ).rejects.toThrow(BadRequestException);
    expect(prisma.feeAdjustment.create).not.toHaveBeenCalled();
  });

  it("rejects an enrollment that does not belong to this school", async () => {
    prisma.studentEnrollment.findFirst.mockResolvedValue(null);

    await expect(service.create(ACTOR, "school-1", BASE_DTO)).rejects.toThrow(BadRequestException);
  });

  it("rejects an invoiceId that does not belong to the given enrollment", async () => {
    prisma.invoice.findFirst.mockResolvedValue(null);

    await expect(service.create(ACTOR, "school-1", { ...BASE_DTO, invoiceId: "inv-other-enrollment" })).rejects.toThrow(
      BadRequestException,
    );
  });

  it("creates an immediately-APPROVED adjustment with the creator recorded as approver", async () => {
    await service.create(ACTOR, "school-1", BASE_DTO);

    expect(prisma.feeAdjustment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ approvedByUserId: "user-1", requestedByUserId: "user-1" }),
      }),
    );
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: "FEE_ADJUSTMENT_CREATED" }));
  });
});
