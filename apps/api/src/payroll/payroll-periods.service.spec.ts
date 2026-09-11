import { ConflictException } from "@nestjs/common";
import { Prisma } from "@school-erp/database";
import type { AuthenticatedUser } from "../auth/types/authenticated-user";
import { PayrollPeriodsService } from "./payroll-periods.service";
import { PrismaService } from "../prisma/prisma.service";
import { SchoolsService } from "../schools/schools.service";
import type { CreatePayrollPeriodDto } from "./dto/create-payroll-period.dto";

const ACTOR: AuthenticatedUser = {
  id: "admin-1",
  email: "admin@example.com",
  organizationId: "org-1",
  roles: ["SCHOOL_ADMIN"],
  permissions: ["payroll.prepare"],
  schoolIds: ["school-1"],
};

function uniqueViolation() {
  return new Prisma.PrismaClientKnownRequestError("Unique constraint failed", { code: "P2002", clientVersion: "test" });
}

function dto(overrides: Partial<CreatePayrollPeriodDto> = {}): CreatePayrollPeriodDto {
  return { name: "January 2027", startDate: "2027-01-01", endDate: "2027-01-31", ...overrides };
}

describe("PayrollPeriodsService.create", () => {
  let prisma: { payrollPeriod: { create: jest.Mock } };
  let schools: { findOneAccessibleOrThrow: jest.Mock };
  let service: PayrollPeriodsService;

  beforeEach(() => {
    prisma = { payrollPeriod: { create: jest.fn() } };
    schools = { findOneAccessibleOrThrow: jest.fn().mockResolvedValue(undefined) };
    service = new PayrollPeriodsService(prisma as unknown as PrismaService, schools as unknown as SchoolsService);
  });

  // Unlike FeeStructure/BillingPeriod, PayrollPeriod has no academicYearId
  // at all — no cross-check to test here, just the date-range guard.
  it("rejects an endDate before startDate", async () => {
    await expect(
      service.create(ACTOR, "school-1", dto({ startDate: "2027-01-31", endDate: "2027-01-01" })),
    ).rejects.toThrow("endDate cannot be before startDate");
    expect(prisma.payrollPeriod.create).not.toHaveBeenCalled();
  });

  it("allows a same-day period (endDate === startDate)", async () => {
    prisma.payrollPeriod.create.mockResolvedValue({ id: "pp-1" });
    await expect(
      service.create(ACTOR, "school-1", dto({ startDate: "2027-01-15", endDate: "2027-01-15" })),
    ).resolves.toBeDefined();
  });

  it("translates a P2002 violation (duplicate name within the school) into a ConflictException", async () => {
    prisma.payrollPeriod.create.mockRejectedValue(uniqueViolation());
    await expect(service.create(ACTOR, "school-1", dto())).rejects.toThrow(ConflictException);
    await expect(service.create(ACTOR, "school-1", dto())).rejects.toThrow(
      "A payroll period with this name already exists for this school",
    );
  });

  it("re-throws non-P2002 errors unchanged", async () => {
    prisma.payrollPeriod.create.mockRejectedValue(new Error("connection reset"));
    await expect(service.create(ACTOR, "school-1", dto())).rejects.toThrow("connection reset");
  });
});

describe("PayrollPeriodsService.close", () => {
  it("force-sets status to CLOSED regardless of the period's current status", async () => {
    const prisma = { payrollPeriod: { update: jest.fn().mockResolvedValue({ id: "pp-1", status: "CLOSED" }) } };
    const schools = { findOneAccessibleOrThrow: jest.fn().mockResolvedValue(undefined) };
    const service = new PayrollPeriodsService(prisma as unknown as PrismaService, schools as unknown as SchoolsService);

    await service.close(ACTOR, "school-1", "pp-1");

    expect(prisma.payrollPeriod.update).toHaveBeenCalledWith({
      where: { id: "pp-1" },
      data: { status: "CLOSED" },
    });
  });

  it("checks the actor's access to schoolId before closing — but does not itself verify the period belongs to that school", async () => {
    // Documents the current implementation as written: close() has no
    // `findFirst({ id, schoolId })` guard the way create()/generateForFeeStructure()
    // do elsewhere in this codebase, so a period id from a different school
    // would still be updated as long as the actor can access *a* school with
    // this id. Not asserting that as desirable — just as the real behavior.
    const prisma = { payrollPeriod: { update: jest.fn().mockResolvedValue({ id: "pp-1" }) } };
    const schools = { findOneAccessibleOrThrow: jest.fn().mockResolvedValue(undefined) };
    const service = new PayrollPeriodsService(prisma as unknown as PrismaService, schools as unknown as SchoolsService);

    await service.close(ACTOR, "school-1", "pp-1");

    expect(schools.findOneAccessibleOrThrow).toHaveBeenCalledWith(ACTOR, "school-1");
    expect(prisma.payrollPeriod.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "pp-1" } }),
    );
  });
});
