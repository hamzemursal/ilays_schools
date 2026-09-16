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
    staffAssignment: { upsert: jest.Mock; findFirst: jest.Mock; update: jest.Mock };
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
      staffAssignment: { upsert: jest.fn(), findFirst: jest.fn(), update: jest.fn() },
    };
    schools = { findOneAccessibleOrThrow: jest.fn().mockResolvedValue({ id: "school-1", organizationId: "org-1", name: "Ilays" }) };
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

  it("generates a permanent, organization-wide staffCode from a fresh org-wide count", async () => {
    prisma.staff.create.mockResolvedValue({ id: "staff-1", firstName: "Amal", lastName: "Nur", staffNumber: "STF-00005" });

    await service.create(ACTOR, "school-1", { firstName: "Amal", lastName: "Nur" });

    expect(prisma.staff.count).toHaveBeenCalledWith();
    expect(prisma.staff.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ staffCode: "STF-00005" }) }),
    );
  });

  it("retries with a fresh staffCode when it collides under a concurrent create, without giving up on the first try", async () => {
    prisma.staff.count
      .mockResolvedValueOnce(4) // generateStaffNumber's school-scoped count
      .mockResolvedValueOnce(9)
      .mockResolvedValueOnce(10);
    prisma.staff.create
      .mockRejectedValueOnce(
        new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
          code: "P2002",
          clientVersion: "test",
          meta: { target: ["staffCode"] },
        }),
      )
      .mockResolvedValueOnce({ id: "staff-1", firstName: "Amal", lastName: "Nur", staffNumber: "STF-00005" });

    await service.create(ACTOR, "school-1", { firstName: "Amal", lastName: "Nur" });

    expect(prisma.staff.create).toHaveBeenNthCalledWith(1, expect.objectContaining({ data: expect.objectContaining({ staffCode: "STF-00010" }) }));
    expect(prisma.staff.create).toHaveBeenNthCalledWith(2, expect.objectContaining({ data: expect.objectContaining({ staffCode: "STF-00011" }) }));
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

describe("StaffService.listForSchool / getOne — home school OR a cross-school assignment here", () => {
  let prisma: { staff: { findMany: jest.Mock; findFirst: jest.Mock } };
  let schools: { findOneAccessibleOrThrow: jest.Mock };
  let service: StaffService;

  beforeEach(() => {
    prisma = { staff: { findMany: jest.fn(), findFirst: jest.fn() } };
    schools = { findOneAccessibleOrThrow: jest.fn().mockResolvedValue({ id: "school-1", organizationId: "org-1" }) };
    service = new StaffService(prisma as unknown as PrismaService, schools as unknown as SchoolsService, { record: jest.fn() } as unknown as AuditService);
  });

  it("listForSchool matches home school OR a StaffAssignment at this school", async () => {
    prisma.staff.findMany.mockResolvedValue([]);
    await service.listForSchool(ACTOR, "school-1");
    expect(schools.findOneAccessibleOrThrow).toHaveBeenCalledWith(ACTOR, "school-1");
    expect(prisma.staff.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { OR: [{ schoolId: "school-1" }, { assignments: { some: { schoolId: "school-1" } } }] } }),
    );
  });

  it("getOne isn't a 404 for a staff member assigned here from another home school", async () => {
    prisma.staff.findFirst.mockResolvedValue({ id: "staff-1", schoolId: "school-2" });
    await service.getOne(ACTOR, "school-1", "staff-1");
    expect(prisma.staff.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "staff-1", OR: [{ schoolId: "school-1" }, { assignments: { some: { schoolId: "school-1" } } }] },
      }),
    );
  });

  it("getOne throws NotFoundException for a staff member not in this school and not assigned here", async () => {
    prisma.staff.findFirst.mockResolvedValue(null);
    await expect(service.getOne(ACTOR, "school-1", "staff-1")).rejects.toThrow(NotFoundException);
  });
});

describe("StaffService.searchAcrossOrg", () => {
  let prisma: { staff: { findMany: jest.Mock } };
  let schools: { findOneAccessibleOrThrow: jest.Mock };
  let service: StaffService;

  beforeEach(() => {
    prisma = { staff: { findMany: jest.fn() } };
    schools = { findOneAccessibleOrThrow: jest.fn().mockResolvedValue({ id: "school-1", organizationId: "org-1" }) };
    service = new StaffService(prisma as unknown as PrismaService, schools as unknown as SchoolsService, { record: jest.fn() } as unknown as AuditService);
  });

  it("returns nothing for a query shorter than 2 characters, without querying the database", async () => {
    const result = await service.searchAcrossOrg(ACTOR, "school-1", "A");
    expect(result).toEqual([]);
    expect(prisma.staff.findMany).not.toHaveBeenCalled();
  });

  it("searches by first/last name, staff number, staffCode, and email, scoped to the organization not a single school", async () => {
    prisma.staff.findMany.mockResolvedValue([]);
    await service.searchAcrossOrg(ACTOR, "school-1", "Amal");
    const where = prisma.staff.findMany.mock.calls[0][0].where;
    expect(where.OR).toContainEqual({ firstName: { contains: "Amal", mode: "insensitive" } });
    expect(where.OR).toContainEqual({ lastName: { contains: "Amal", mode: "insensitive" } });
    expect(where.OR).toContainEqual({ staffNumber: { contains: "Amal", mode: "insensitive" } });
    expect(where.OR).toContainEqual({ staffCode: { contains: "Amal", mode: "insensitive" } });
    expect(where.OR).toContainEqual({ email: { contains: "Amal", mode: "insensitive" } });
    expect(where.school).toEqual({ organizationId: "org-1" });
    expect(where.schoolId).toBeUndefined();
  });

  it("includes each result's home school and permanent staffCode", async () => {
    prisma.staff.findMany.mockResolvedValue([
      { id: "staff-1", firstName: "Amal", lastName: "Nur", staffNumber: "STF-0002", staffCode: "STF-00042", email: null, phone: null, school: { id: "school-2", name: "Ilays Secondary School", type: "SECONDARY" } },
    ]);
    const result = await service.searchAcrossOrg(ACTOR, "school-1", "Amal");
    expect(result[0].school).toEqual({ id: "school-2", name: "Ilays Secondary School", type: "SECONDARY" });
    expect(result[0].staffCode).toBe("STF-00042");
  });
});

describe("StaffService.assignToSchool / deactivateAssignment", () => {
  let prisma: {
    staff: { findFirst: jest.Mock };
    department: { findFirst: jest.Mock };
    staffAssignment: { upsert: jest.Mock; findFirst: jest.Mock; update: jest.Mock };
  };
  let schools: { findOneAccessibleOrThrow: jest.Mock };
  let audit: { record: jest.Mock };
  let service: StaffService;

  beforeEach(() => {
    prisma = {
      staff: { findFirst: jest.fn() },
      department: { findFirst: jest.fn() },
      staffAssignment: { upsert: jest.fn(), findFirst: jest.fn(), update: jest.fn() },
    };
    schools = { findOneAccessibleOrThrow: jest.fn().mockResolvedValue({ id: "school-1", organizationId: "org-1" }) };
    audit = { record: jest.fn().mockResolvedValue(undefined) };
    service = new StaffService(prisma as unknown as PrismaService, schools as unknown as SchoolsService, audit as unknown as AuditService);
  });

  it("assignToSchool throws NotFoundException for a staff member not in this organization", async () => {
    prisma.staff.findFirst.mockResolvedValue(null);
    await expect(service.assignToSchool(ACTOR, "school-1", "staff-1", {})).rejects.toThrow(NotFoundException);
    expect(prisma.staffAssignment.upsert).not.toHaveBeenCalled();
  });

  it("assignToSchool succeeds for a staff member whose home school differs from this one, same organization", async () => {
    prisma.staff.findFirst.mockResolvedValue({ id: "staff-1", firstName: "Amal", lastName: "Nur", schoolId: "school-2" });
    prisma.staffAssignment.upsert.mockResolvedValue({ id: "assign-1" });

    await service.assignToSchool(ACTOR, "school-1", "staff-1", { role: "Librarian" });

    expect(prisma.staff.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "staff-1", school: { organizationId: "org-1" } } }),
    );
    expect(prisma.staffAssignment.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { staffId_schoolId: { staffId: "staff-1", schoolId: "school-1" } },
        create: { staffId: "staff-1", schoolId: "school-1", departmentId: undefined, role: "Librarian", status: "ACTIVE" },
        update: { departmentId: undefined, role: "Librarian", status: "ACTIVE" },
      }),
    );
  });

  it("assignToSchool rejects a department that does not belong to this school", async () => {
    prisma.staff.findFirst.mockResolvedValue({ id: "staff-1", firstName: "Amal", lastName: "Nur" });
    prisma.department.findFirst.mockResolvedValue(null);

    await expect(
      service.assignToSchool(ACTOR, "school-1", "staff-1", { departmentId: "dept-other-school" }),
    ).rejects.toThrow(BadRequestException);
    expect(prisma.staffAssignment.upsert).not.toHaveBeenCalled();
  });

  it("assignToSchool records a STAFF_ASSIGNED_TO_SCHOOL audit entry", async () => {
    prisma.staff.findFirst.mockResolvedValue({ id: "staff-1", firstName: "Amal", lastName: "Nur" });
    prisma.staffAssignment.upsert.mockResolvedValue({ id: "assign-1" });

    await service.assignToSchool(ACTOR, "school-1", "staff-1", {});

    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: "STAFF_ASSIGNED_TO_SCHOOL", resourceId: "staff-1" }));
  });

  it("deactivateAssignment throws NotFoundException for an assignment not belonging to this staff member at this school", async () => {
    prisma.staff.findFirst.mockResolvedValue({ id: "staff-1", firstName: "Amal", lastName: "Nur" });
    prisma.staffAssignment.findFirst.mockResolvedValue(null);

    await expect(service.deactivateAssignment(ACTOR, "school-1", "staff-1", "assign-1")).rejects.toThrow(NotFoundException);
    expect(prisma.staffAssignment.update).not.toHaveBeenCalled();
  });

  it("deactivateAssignment sets status to INACTIVE without deleting the row", async () => {
    prisma.staff.findFirst.mockResolvedValue({ id: "staff-1", firstName: "Amal", lastName: "Nur" });
    prisma.staffAssignment.findFirst.mockResolvedValue({ id: "assign-1", staffId: "staff-1", schoolId: "school-1" });
    prisma.staffAssignment.update.mockResolvedValue({ id: "assign-1", status: "INACTIVE" });

    await service.deactivateAssignment(ACTOR, "school-1", "staff-1", "assign-1");

    expect(prisma.staffAssignment.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "assign-1" }, data: { status: "INACTIVE" } }),
    );
  });

  it("assignToSchool reactivates the same (unique) row when re-assigning someone previously deactivated here — an upsert, not a duplicate", async () => {
    prisma.staff.findFirst.mockResolvedValue({ id: "staff-1", firstName: "Amal", lastName: "Nur" });
    prisma.staffAssignment.upsert.mockResolvedValue({ id: "assign-1", status: "ACTIVE" });

    const result = await service.assignToSchool(ACTOR, "school-1", "staff-1", {});

    expect(prisma.staffAssignment.upsert).toHaveBeenCalledTimes(1);
    expect(result.status).toBe("ACTIVE");
  });
});
