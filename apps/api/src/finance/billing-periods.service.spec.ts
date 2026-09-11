import { ConflictException } from "@nestjs/common";
import { Prisma } from "@school-erp/database";
import type { AuthenticatedUser } from "../auth/types/authenticated-user";
import { BillingPeriodsService } from "./billing-periods.service";
import { PrismaService } from "../prisma/prisma.service";
import { SchoolsService } from "../schools/schools.service";
import type { CreateBillingPeriodDto } from "./dto/create-billing-period.dto";

const ACTOR: AuthenticatedUser = {
  id: "admin-1",
  email: "admin@example.com",
  organizationId: "org-1",
  roles: ["SCHOOL_ADMIN"],
  permissions: ["fees.manage"],
  schoolIds: ["school-1"],
};

function uniqueViolation() {
  return new Prisma.PrismaClientKnownRequestError("Unique constraint failed", { code: "P2002", clientVersion: "test" });
}

function dto(overrides: Partial<CreateBillingPeriodDto> = {}): CreateBillingPeriodDto {
  return { academicYearId: "year-1", name: "Term 1", startDate: "2027-01-01", endDate: "2027-04-30", ...overrides };
}

describe("BillingPeriodsService.create", () => {
  let prisma: {
    academicYear: { findFirst: jest.Mock };
    billingPeriod: { create: jest.Mock };
  };
  let schools: { findOneAccessibleOrThrow: jest.Mock };
  let service: BillingPeriodsService;

  beforeEach(() => {
    prisma = {
      academicYear: { findFirst: jest.fn().mockResolvedValue({ id: "year-1", schoolId: "school-1" }) },
      billingPeriod: { create: jest.fn() },
    };
    schools = { findOneAccessibleOrThrow: jest.fn().mockResolvedValue(undefined) };
    service = new BillingPeriodsService(prisma as unknown as PrismaService, schools as unknown as SchoolsService);
  });

  it("rejects an academic year that doesn't belong to this school", async () => {
    prisma.academicYear.findFirst.mockResolvedValue(null);
    await expect(service.create(ACTOR, "school-1", dto())).rejects.toThrow(
      "That academic year does not belong to this school",
    );
    expect(prisma.billingPeriod.create).not.toHaveBeenCalled();
  });

  it("rejects an endDate before startDate", async () => {
    await expect(
      service.create(ACTOR, "school-1", dto({ startDate: "2027-04-30", endDate: "2027-01-01" })),
    ).rejects.toThrow("endDate cannot be before startDate");
    expect(prisma.billingPeriod.create).not.toHaveBeenCalled();
  });

  it("allows a same-day period (endDate === startDate)", async () => {
    prisma.billingPeriod.create.mockResolvedValue({ id: "bp-1" });
    await expect(
      service.create(ACTOR, "school-1", dto({ startDate: "2027-04-01", endDate: "2027-04-01" })),
    ).resolves.toBeDefined();
  });

  it("translates a P2002 violation (duplicate name within the academic year) into a ConflictException", async () => {
    prisma.billingPeriod.create.mockRejectedValue(uniqueViolation());
    await expect(service.create(ACTOR, "school-1", dto())).rejects.toThrow(ConflictException);
    await expect(service.create(ACTOR, "school-1", dto())).rejects.toThrow(
      "A billing period with this name already exists for this academic year",
    );
  });

  it("re-throws non-P2002 errors unchanged", async () => {
    prisma.billingPeriod.create.mockRejectedValue(new Error("connection reset"));
    await expect(service.create(ACTOR, "school-1", dto())).rejects.toThrow("connection reset");
  });
});

describe("BillingPeriodsService.listForSchool", () => {
  it("filters by academicYearId only when provided", async () => {
    const prisma = { billingPeriod: { findMany: jest.fn().mockResolvedValue([]) } };
    const schools = { findOneAccessibleOrThrow: jest.fn().mockResolvedValue(undefined) };
    const service = new BillingPeriodsService(prisma as unknown as PrismaService, schools as unknown as SchoolsService);

    await service.listForSchool(ACTOR, "school-1");
    expect(prisma.billingPeriod.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { schoolId: "school-1" } }),
    );

    await service.listForSchool(ACTOR, "school-1", "year-1");
    expect(prisma.billingPeriod.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { schoolId: "school-1", academicYearId: "year-1" } }),
    );
  });
});
