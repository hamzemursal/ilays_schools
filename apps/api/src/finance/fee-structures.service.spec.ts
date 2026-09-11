import { BadRequestException, ConflictException } from "@nestjs/common";
import { Prisma } from "@school-erp/database";
import type { AuthenticatedUser } from "../auth/types/authenticated-user";
import { FeeStructuresService } from "./fee-structures.service";
import { PrismaService } from "../prisma/prisma.service";
import { SchoolsService } from "../schools/schools.service";
import type { CreateFeeStructureDto } from "./dto/create-fee-structure.dto";

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

function dto(overrides: Partial<CreateFeeStructureDto> = {}): CreateFeeStructureDto {
  return { academicYearId: "year-1", name: "Tuition Term 1", amount: 150, ...overrides };
}

describe("FeeStructuresService.create", () => {
  let prisma: {
    academicYear: { findFirst: jest.Mock };
    class: { findFirst: jest.Mock };
    feeStructure: { create: jest.Mock };
  };
  let schools: { findOneAccessibleOrThrow: jest.Mock };
  let service: FeeStructuresService;

  beforeEach(() => {
    prisma = {
      academicYear: { findFirst: jest.fn().mockResolvedValue({ id: "year-1", schoolId: "school-1" }) },
      class: { findFirst: jest.fn() },
      feeStructure: { create: jest.fn() },
    };
    schools = { findOneAccessibleOrThrow: jest.fn().mockResolvedValue(undefined) };
    service = new FeeStructuresService(prisma as unknown as PrismaService, schools as unknown as SchoolsService);
  });

  it("rejects an academic year that doesn't belong to this school", async () => {
    prisma.academicYear.findFirst.mockResolvedValue(null);
    await expect(service.create(ACTOR, "school-1", dto())).rejects.toThrow(
      "That academic year does not belong to this school",
    );
    expect(prisma.feeStructure.create).not.toHaveBeenCalled();
  });

  it("creates a school-wide fee structure when classId is omitted, without checking any class", async () => {
    prisma.feeStructure.create.mockResolvedValue({ id: "fee-1" });
    await service.create(ACTOR, "school-1", dto());
    expect(prisma.class.findFirst).not.toHaveBeenCalled();
    expect(prisma.feeStructure.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ classId: undefined }) }),
    );
  });

  it("rejects a classId that doesn't belong to this school (via division.schoolId)", async () => {
    prisma.class.findFirst.mockResolvedValue(null);
    await expect(service.create(ACTOR, "school-1", dto({ classId: "class-1" }))).rejects.toThrow(
      "That class does not belong to this school",
    );
    expect(prisma.class.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "class-1", division: { schoolId: "school-1" } } }),
    );
  });

  it("creates a class-scoped fee structure once the class is validated", async () => {
    prisma.class.findFirst.mockResolvedValue({ id: "class-1" });
    prisma.feeStructure.create.mockResolvedValue({ id: "fee-1" });
    await service.create(ACTOR, "school-1", dto({ classId: "class-1" }));
    expect(prisma.feeStructure.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ classId: "class-1" }) }),
    );
  });

  it("translates a P2002 violation (duplicate name within the same scope) into a ConflictException", async () => {
    prisma.feeStructure.create.mockRejectedValue(uniqueViolation());
    await expect(service.create(ACTOR, "school-1", dto())).rejects.toThrow(ConflictException);
    await expect(service.create(ACTOR, "school-1", dto())).rejects.toThrow(
      "A fee with this name already exists for this scope",
    );
  });

  it("re-throws non-P2002 errors unchanged", async () => {
    prisma.feeStructure.create.mockRejectedValue(new Error("connection reset"));
    await expect(service.create(ACTOR, "school-1", dto())).rejects.toThrow("connection reset");
  });
});

describe("FeeStructuresService.listForSchool", () => {
  it("checks school access before listing", async () => {
    const prisma = { feeStructure: { findMany: jest.fn().mockResolvedValue([]) } };
    const schools = { findOneAccessibleOrThrow: jest.fn().mockRejectedValue(new BadRequestException("no access")) };
    const service = new FeeStructuresService(prisma as unknown as PrismaService, schools as unknown as SchoolsService);

    await expect(service.listForSchool(ACTOR, "school-1")).rejects.toThrow("no access");
    expect(prisma.feeStructure.findMany).not.toHaveBeenCalled();
  });
});
