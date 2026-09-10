import { BadRequestException } from "@nestjs/common";
import type { AuthenticatedUser } from "../auth/types/authenticated-user";
import { ChargesService } from "./charges.service";
import { PrismaService } from "../prisma/prisma.service";
import { SchoolsService } from "../schools/schools.service";
import { AuditService } from "../audit/audit.service";

const ACTOR: AuthenticatedUser = {
  id: "user-1",
  email: "accountant@example.com",
  organizationId: "org-1",
  roles: ["ACCOUNTANT"],
  permissions: ["payments.record"],
  schoolIds: ["school-1"],
};

describe("ChargesService", () => {
  let prisma: {
    charge: { findUnique: jest.Mock };
  };
  let schools: { findOneAccessibleOrThrow: jest.Mock };
  let audit: { record: jest.Mock };
  let service: ChargesService;

  beforeEach(() => {
    prisma = { charge: { findUnique: jest.fn() } };
    schools = { findOneAccessibleOrThrow: jest.fn().mockResolvedValue(undefined) };
    audit = { record: jest.fn().mockResolvedValue(undefined) };
    service = new ChargesService(
      prisma as unknown as PrismaService,
      schools as unknown as SchoolsService,
      audit as unknown as AuditService,
    );
  });

  it("rejects a payment that would exceed the charge's remaining balance, counting only POSTED prior payments", async () => {
    prisma.charge.findUnique.mockResolvedValue({
      id: "chg-1",
      schoolId: "school-1",
      amount: "100.00",
      payments: [
        { status: "POSTED", amount: "60.00" },
        { status: "REVERSED", amount: "1000.00" }, // must not count toward the already-paid total
      ],
    });

    // Remaining balance is 100 - 60 = 40; a 50 payment must be rejected.
    await expect(service.recordPayment(ACTOR, "chg-1", { amount: 50 })).rejects.toThrow(BadRequestException);
  });
});
