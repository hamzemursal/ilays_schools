import { BadRequestException } from "@nestjs/common";
import type { AuthenticatedUser } from "../auth/types/authenticated-user";
import { SalaryHistoryService } from "./salary-history.service";
import { PrismaService } from "../prisma/prisma.service";
import { SchoolsService } from "../schools/schools.service";
import { AuditService } from "../audit/audit.service";

const ACTOR: AuthenticatedUser = {
  id: "user-1",
  email: "hr@example.com",
  organizationId: "org-1",
  roles: ["FINANCE_STAFF"],
  permissions: ["payroll.prepare"],
  schoolIds: ["school-1"],
};

describe("SalaryHistoryService.create", () => {
  let prisma: {
    staff: { findFirst: jest.Mock };
    teacher: { findFirst: jest.Mock };
    salaryHistory: { findFirst: jest.Mock; update: jest.Mock; create: jest.Mock };
    $transaction: jest.Mock;
  };
  let schools: { findOneAccessibleOrThrow: jest.Mock };
  let audit: { record: jest.Mock };
  let service: SalaryHistoryService;

  beforeEach(() => {
    prisma = {
      staff: { findFirst: jest.fn().mockResolvedValue({ id: "staff-1" }) },
      teacher: { findFirst: jest.fn() },
      salaryHistory: { findFirst: jest.fn(), update: jest.fn(), create: jest.fn() },
      $transaction: jest.fn((cb: (tx: unknown) => unknown) => cb(prisma)),
    };
    schools = { findOneAccessibleOrThrow: jest.fn().mockResolvedValue(undefined) };
    audit = { record: jest.fn().mockResolvedValue(undefined) };
    service = new SalaryHistoryService(
      prisma as unknown as PrismaService,
      schools as unknown as SchoolsService,
      audit as unknown as AuditService,
    );
  });

  it("closes the prior current row (effectiveTo) when a raise starts and keeps both rows", async () => {
    prisma.salaryHistory.findFirst.mockResolvedValue({
      id: "sal-old",
      effectiveFrom: new Date("2027-01-01"),
      basicSalary: "300.00",
    });
    prisma.salaryHistory.create.mockResolvedValue({ id: "sal-new" });

    await service.create(ACTOR, "school-1", { staffId: "staff-1", basicSalary: 350, effectiveFrom: "2027-07-01" });

    expect(prisma.salaryHistory.update).toHaveBeenCalledWith({
      where: { id: "sal-old" },
      data: { effectiveTo: new Date("2027-07-01") },
    });
    expect(prisma.salaryHistory.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ basicSalary: 350, staffId: "staff-1" }) }),
    );
  });

  it("rejects a new effectiveFrom that isn't after the current row's own effectiveFrom", async () => {
    prisma.salaryHistory.findFirst.mockResolvedValue({
      id: "sal-old",
      effectiveFrom: new Date("2027-07-01"),
      basicSalary: "300.00",
    });

    await expect(
      service.create(ACTOR, "school-1", { staffId: "staff-1", basicSalary: 350, effectiveFrom: "2027-01-01" }),
    ).rejects.toThrow(BadRequestException);
    expect(prisma.salaryHistory.create).not.toHaveBeenCalled();
  });

  it("rejects naming both a teacher and a staff member", async () => {
    await expect(
      service.create(ACTOR, "school-1", { teacherId: "t-1", staffId: "staff-1", basicSalary: 300 }),
    ).rejects.toThrow(BadRequestException);
  });
});
