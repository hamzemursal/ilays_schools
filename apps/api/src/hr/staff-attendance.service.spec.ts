import { BadRequestException } from "@nestjs/common";
import type { AuthenticatedUser } from "../auth/types/authenticated-user";
import { StaffAttendanceService } from "./staff-attendance.service";
import { PrismaService } from "../prisma/prisma.service";
import { SchoolsService } from "../schools/schools.service";
import { AuditService } from "../audit/audit.service";

const ACTOR: AuthenticatedUser = {
  id: "user-1",
  email: "hr@example.com",
  organizationId: "org-1",
  roles: ["HR_STAFF"],
  permissions: ["hr.attendance.mark"],
  schoolIds: ["school-1"],
};

describe("StaffAttendanceService.mark", () => {
  let prisma: {
    teacher: { findFirst: jest.Mock };
    staff: { findFirst: jest.Mock };
    staffAttendance: { findFirst: jest.Mock; create: jest.Mock; update: jest.Mock };
  };
  let schools: { findOneAccessibleOrThrow: jest.Mock };
  let audit: { record: jest.Mock };
  let service: StaffAttendanceService;

  beforeEach(() => {
    prisma = {
      teacher: { findFirst: jest.fn() },
      staff: { findFirst: jest.fn().mockResolvedValue({ id: "staff-1" }) },
      staffAttendance: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
    };
    schools = { findOneAccessibleOrThrow: jest.fn().mockResolvedValue(undefined) };
    audit = { record: jest.fn().mockResolvedValue(undefined) };
    service = new StaffAttendanceService(
      prisma as unknown as PrismaService,
      schools as unknown as SchoolsService,
      audit as unknown as AuditService,
    );
  });

  const dto = { date: "2027-02-01", status: "PRESENT" as const, staffId: "staff-1" };

  it("rejects marking attendance for neither a teacher nor a staff member", async () => {
    await expect(service.mark(ACTOR, "school-1", { ...dto, staffId: undefined })).rejects.toThrow(BadRequestException);
  });

  it("creates a new record when none exists for that person/day", async () => {
    prisma.staffAttendance.findFirst.mockResolvedValue(null);
    prisma.staffAttendance.create.mockResolvedValue({ id: "att-1", teacher: null, staff: { firstName: "Amal", lastName: "Nur" } });

    await service.mark(ACTOR, "school-1", dto);

    expect(prisma.staffAttendance.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ staffId: "staff-1", status: "PRESENT" }) }),
    );
    expect(prisma.staffAttendance.update).not.toHaveBeenCalled();
  });

  it("updates the existing record instead of creating a duplicate when re-marking the same day", async () => {
    prisma.staffAttendance.findFirst.mockResolvedValue({ id: "att-existing" });
    prisma.staffAttendance.update.mockResolvedValue({ id: "att-existing", teacher: null, staff: { firstName: "Amal", lastName: "Nur" } });

    await service.mark(ACTOR, "school-1", { ...dto, status: "LATE" });

    expect(prisma.staffAttendance.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "att-existing" }, data: expect.objectContaining({ status: "LATE" }) }),
    );
    expect(prisma.staffAttendance.create).not.toHaveBeenCalled();
  });
});
