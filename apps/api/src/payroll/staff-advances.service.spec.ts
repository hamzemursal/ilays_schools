import { BadRequestException, NotFoundException } from "@nestjs/common";
import { Prisma } from "@school-erp/database";
import type { AuthenticatedUser } from "../auth/types/authenticated-user";
import { StaffAdvancesService } from "./staff-advances.service";
import { PrismaService } from "../prisma/prisma.service";
import { SchoolsService } from "../schools/schools.service";
import { AuditService } from "../audit/audit.service";
import type { CreateStaffAdvanceDto } from "./dto/create-staff-advance.dto";

const ACTOR: AuthenticatedUser = {
  id: "admin-1",
  email: "admin@example.com",
  organizationId: "org-1",
  roles: ["SCHOOL_ADMIN"],
  permissions: ["payroll.prepare"],
  schoolIds: ["school-1"],
};

type MockPrisma = {
  teacher: { findFirst: jest.Mock };
  staff: { findFirst: jest.Mock };
  staffAdvance: { findMany: jest.Mock; create: jest.Mock; findUnique: jest.Mock };
};

function createMockPrisma(): MockPrisma {
  return {
    teacher: { findFirst: jest.fn() },
    staff: { findFirst: jest.fn() },
    staffAdvance: { findMany: jest.fn(), create: jest.fn(), findUnique: jest.fn() },
  };
}

function createService(prisma: MockPrisma) {
  const schools = { findOneAccessibleOrThrow: jest.fn().mockResolvedValue(undefined) };
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  const service = new StaffAdvancesService(
    prisma as unknown as PrismaService,
    schools as unknown as SchoolsService,
    audit as unknown as AuditService,
  );
  return { service, schools, audit };
}

describe("StaffAdvancesService.create — exactly-one-employee resolution", () => {
  let prisma: MockPrisma;
  let service: StaffAdvancesService;

  beforeEach(() => {
    prisma = createMockPrisma();
    ({ service } = createService(prisma));
    prisma.staffAdvance.create.mockResolvedValue({ id: "adv-1" });
  });

  function dto(overrides: Partial<CreateStaffAdvanceDto> = {}): CreateStaffAdvanceDto {
    return { amount: 100, repaymentPerPeriod: 50, ...overrides };
  }

  it("rejects when both teacherId and staffId are given", async () => {
    await expect(
      service.create(ACTOR, "school-1", dto({ teacherId: "t-1", staffId: "s-1" })),
    ).rejects.toThrow("Provide exactly one of teacherId or staffId");
    expect(prisma.staffAdvance.create).not.toHaveBeenCalled();
  });

  it("rejects when neither teacherId nor staffId is given", async () => {
    await expect(service.create(ACTOR, "school-1", dto())).rejects.toThrow(
      "Provide exactly one of teacherId or staffId",
    );
  });

  it("rejects a teacherId that doesn't belong to this school", async () => {
    prisma.teacher.findFirst.mockResolvedValue(null);
    await expect(service.create(ACTOR, "school-1", dto({ teacherId: "t-1" }))).rejects.toThrow(
      "That teacher does not belong to this school",
    );
  });

  it("rejects a staffId that doesn't belong to this school", async () => {
    prisma.staff.findFirst.mockResolvedValue(null);
    await expect(service.create(ACTOR, "school-1", dto({ staffId: "s-1" }))).rejects.toThrow(
      "That staff member does not belong to this school",
    );
  });

  it("creates the advance for a valid teacherId, leaving staffId undefined", async () => {
    prisma.teacher.findFirst.mockResolvedValue({ id: "t-1" });
    await service.create(ACTOR, "school-1", dto({ teacherId: "t-1" }));
    expect(prisma.staffAdvance.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ teacherId: "t-1", staffId: undefined }) }),
    );
  });

  it("creates the advance for a valid staffId, leaving teacherId undefined", async () => {
    prisma.staff.findFirst.mockResolvedValue({ id: "s-1" });
    await service.create(ACTOR, "school-1", dto({ staffId: "s-1" }));
    expect(prisma.staffAdvance.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ teacherId: undefined, staffId: "s-1" }) }),
    );
  });

  it("returns the raw created row, not run through toView (no totalRepaid/remainingBalance)", async () => {
    prisma.teacher.findFirst.mockResolvedValue({ id: "t-1" });
    prisma.staffAdvance.create.mockResolvedValue({ id: "adv-1", amount: "100.00" });
    const result = await service.create(ACTOR, "school-1", dto({ teacherId: "t-1" }));
    expect(result).toEqual({ id: "adv-1", amount: "100.00" });
    expect(result).not.toHaveProperty("totalRepaid");
  });
});

describe("StaffAdvancesService — Decimal-based outstanding balance (toView)", () => {
  let prisma: MockPrisma;
  let service: StaffAdvancesService;

  beforeEach(() => {
    prisma = createMockPrisma();
    ({ service } = createService(prisma));
  });

  it("listForSchool computes totalRepaid and remainingBalance across multiple repayments", async () => {
    prisma.staffAdvance.findMany.mockResolvedValue([
      {
        id: "adv-1",
        amount: "100.00",
        status: "ACTIVE",
        repayments: [{ amount: "30.00" }, { amount: "20.00" }],
      },
    ]);

    const [view] = await service.listForSchool(ACTOR, "school-1");

    expect(view.totalRepaid).toBe(50);
    expect(view.remainingBalance).toBe(50);
  });

  it("reports remainingBalance equal to the full amount when there are no repayments yet", async () => {
    prisma.staffAdvance.findMany.mockResolvedValue([
      { id: "adv-1", amount: "100.00", status: "ACTIVE", repayments: [] },
    ]);

    const [view] = await service.listForSchool(ACTOR, "school-1");

    expect(view.totalRepaid).toBe(0);
    expect(view.remainingBalance).toBe(100);
  });

  it("filters by teacherId/staffId only when provided", async () => {
    prisma.staffAdvance.findMany.mockResolvedValue([]);
    await service.listForSchool(ACTOR, "school-1", "t-1");
    expect(prisma.staffAdvance.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { schoolId: "school-1", teacherId: "t-1" } }),
    );

    await service.listForSchool(ACTOR, "school-1", undefined, "s-1");
    expect(prisma.staffAdvance.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { schoolId: "school-1", staffId: "s-1" } }),
    );
  });

  it("getOutstanding throws NotFoundException for a missing advance", async () => {
    prisma.staffAdvance.findUnique.mockResolvedValue(null);
    await expect(service.getOutstanding("missing-id")).rejects.toThrow(NotFoundException);
  });

  it("getOutstanding runs against a provided transaction client instead of the default PrismaService", async () => {
    const tx = { staffAdvance: { findUnique: jest.fn().mockResolvedValue({ id: "adv-1", amount: "100.00", status: "ACTIVE", repayments: [] }) } };
    const view = await service.getOutstanding("adv-1", tx as unknown as Prisma.TransactionClient);
    expect(tx.staffAdvance.findUnique).toHaveBeenCalledWith({ where: { id: "adv-1" }, include: { repayments: true } });
    expect(prisma.staffAdvance.findUnique).not.toHaveBeenCalled();
    expect(view.remainingBalance).toBe(100);
  });
});

describe("StaffAdvancesService — access control", () => {
  it("checks school access before listing or creating", async () => {
    const prisma = createMockPrisma();
    const schools = { findOneAccessibleOrThrow: jest.fn().mockRejectedValue(new BadRequestException("no access")) };
    const audit = { record: jest.fn() };
    const service = new StaffAdvancesService(
      prisma as unknown as PrismaService,
      schools as unknown as SchoolsService,
      audit as unknown as AuditService,
    );

    await expect(service.listForSchool(ACTOR, "school-1")).rejects.toThrow("no access");
    await expect(
      service.create(ACTOR, "school-1", { teacherId: "t-1", amount: 100, repaymentPerPeriod: 50 }),
    ).rejects.toThrow("no access");
    expect(prisma.staffAdvance.create).not.toHaveBeenCalled();
  });
});
