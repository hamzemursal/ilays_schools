import { ConflictException, NotFoundException } from "@nestjs/common";
import { Prisma } from "@school-erp/database";
import type { AuthenticatedUser } from "../auth/types/authenticated-user";
import { DepartmentsService } from "./departments.service";
import { PrismaService } from "../prisma/prisma.service";
import { SchoolsService } from "../schools/schools.service";
import { AuditService } from "../audit/audit.service";

const ACTOR: AuthenticatedUser = {
  id: "user-1",
  email: "admin@example.com",
  organizationId: "org-1",
  roles: ["SCHOOL_ADMIN"],
  permissions: ["departments.manage"],
  schoolIds: ["school-1"],
};

function uniqueViolation() {
  return new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
    code: "P2002",
    clientVersion: "test",
  });
}

describe("DepartmentsService", () => {
  let prisma: {
    department: { findMany: jest.Mock; findFirst: jest.Mock; create: jest.Mock; update: jest.Mock };
  };
  let schools: { findOneAccessibleOrThrow: jest.Mock };
  let audit: { record: jest.Mock };
  let service: DepartmentsService;

  beforeEach(() => {
    prisma = {
      department: { findMany: jest.fn(), findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
    };
    schools = { findOneAccessibleOrThrow: jest.fn().mockResolvedValue(undefined) };
    audit = { record: jest.fn().mockResolvedValue(undefined) };
    service = new DepartmentsService(
      prisma as unknown as PrismaService,
      schools as unknown as SchoolsService,
      audit as unknown as AuditService,
    );
  });

  it("enforces school isolation on list", async () => {
    prisma.department.findMany.mockResolvedValue([]);

    await service.listForSchool(ACTOR, "school-1");

    expect(schools.findOneAccessibleOrThrow).toHaveBeenCalledWith(ACTOR, "school-1");
    expect(prisma.department.findMany).toHaveBeenCalledWith({
      where: { schoolId: "school-1" },
      orderBy: { name: "asc" },
    });
  });

  it("creates a department and records an audit entry", async () => {
    prisma.department.create.mockResolvedValue({ id: "dept-1", name: "Finance" });

    const result = await service.create(ACTOR, "school-1", { name: "Finance" });

    expect(schools.findOneAccessibleOrThrow).toHaveBeenCalledWith(ACTOR, "school-1");
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: "DEPARTMENT_CREATED", resourceId: "dept-1" }),
    );
    expect(result).toEqual({ id: "dept-1", name: "Finance" });
  });

  it("rejects a duplicate department name within the same school", async () => {
    prisma.department.create.mockRejectedValue(uniqueViolation());

    await expect(service.create(ACTOR, "school-1", { name: "Finance" })).rejects.toThrow(ConflictException);
  });

  it("throws NotFoundException updating a department that doesn't belong to this school", async () => {
    prisma.department.findFirst.mockResolvedValue(null);

    await expect(service.update(ACTOR, "school-1", "dept-x", { name: "New Name" })).rejects.toThrow(
      NotFoundException,
    );
    expect(prisma.department.update).not.toHaveBeenCalled();
  });
});
