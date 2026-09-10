import { BadRequestException, ConflictException, NotFoundException } from "@nestjs/common";
import { Prisma } from "@school-erp/database";
import type { AuthenticatedUser } from "../auth/types/authenticated-user";
import { StaffService } from "./staff.service";
import { PrismaService } from "../prisma/prisma.service";
import { SchoolsService } from "../schools/schools.service";
import { AuditService } from "../audit/audit.service";

const ACTOR: AuthenticatedUser = {
  id: "user-1",
  email: "admin@example.com",
  organizationId: "org-1",
  roles: ["SCHOOL_ADMIN"],
  permissions: ["staff.create"],
  schoolIds: ["school-1"],
};

function uniqueViolation() {
  return new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
    code: "P2002",
    clientVersion: "test",
  });
}

describe("StaffService", () => {
  let prisma: {
    staff: { findMany: jest.Mock; findFirst: jest.Mock; create: jest.Mock; update: jest.Mock; count: jest.Mock };
    department: { findFirst: jest.Mock };
  };
  let schools: { findOneAccessibleOrThrow: jest.Mock };
  let audit: { record: jest.Mock };
  let service: StaffService;

  beforeEach(() => {
    prisma = {
      staff: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        count: jest.fn().mockResolvedValue(4),
      },
      department: { findFirst: jest.fn() },
    };
    schools = { findOneAccessibleOrThrow: jest.fn().mockResolvedValue(undefined) };
    audit = { record: jest.fn().mockResolvedValue(undefined) };
    service = new StaffService(
      prisma as unknown as PrismaService,
      schools as unknown as SchoolsService,
      audit as unknown as AuditService,
    );
  });

  it("generates a sequential STF- staff number scoped to the school when none is given", async () => {
    prisma.staff.create.mockResolvedValue({ id: "staff-1", firstName: "Amal", lastName: "Nur", staffNumber: "STF-00005" });

    await service.create(ACTOR, "school-1", { firstName: "Amal", lastName: "Nur" });

    expect(prisma.staff.count).toHaveBeenCalledWith({ where: { schoolId: "school-1" } });
    expect(prisma.staff.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ staffNumber: "STF-00005" }) }),
    );
  });

  it("rejects a department that does not belong to this school", async () => {
    prisma.department.findFirst.mockResolvedValue(null);

    await expect(
      service.create(ACTOR, "school-1", { firstName: "Amal", lastName: "Nur", departmentId: "dept-other-school" }),
    ).rejects.toThrow(BadRequestException);
    expect(prisma.staff.create).not.toHaveBeenCalled();
  });

  it("rejects a duplicate staff number within the same school", async () => {
    prisma.staff.create.mockRejectedValue(uniqueViolation());

    await expect(
      service.create(ACTOR, "school-1", { firstName: "Amal", lastName: "Nur", staffNumber: "STF-00001" }),
    ).rejects.toThrow(ConflictException);
  });

  it("throws NotFoundException updating a staff member outside this school", async () => {
    prisma.staff.findFirst.mockResolvedValue(null);

    await expect(service.update(ACTOR, "school-1", "staff-x", { firstName: "New" })).rejects.toThrow(
      NotFoundException,
    );
    expect(prisma.staff.update).not.toHaveBeenCalled();
  });
});
