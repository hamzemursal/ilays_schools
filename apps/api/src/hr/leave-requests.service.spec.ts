import { BadRequestException, NotFoundException } from "@nestjs/common";
import type { AuthenticatedUser } from "../auth/types/authenticated-user";
import { LeaveRequestsService } from "./leave-requests.service";
import { PrismaService } from "../prisma/prisma.service";
import { SchoolsService } from "../schools/schools.service";
import { NotificationsService } from "../notifications/notifications.service";
import { AuditService } from "../audit/audit.service";

const ACTOR: AuthenticatedUser = {
  id: "user-1",
  email: "hr@example.com",
  organizationId: "org-1",
  roles: ["HR_STAFF"],
  permissions: ["hr.leave.manage", "hr.leave.approve"],
  schoolIds: ["school-1"],
};

describe("LeaveRequestsService", () => {
  let prisma: {
    teacher: { findFirst: jest.Mock };
    staff: { findFirst: jest.Mock };
    leaveRequest: { findFirst: jest.Mock; create: jest.Mock; update: jest.Mock };
  };
  let schools: { findOneAccessibleOrThrow: jest.Mock };
  let notifications: { notifyUser: jest.Mock };
  let audit: { record: jest.Mock };
  let service: LeaveRequestsService;

  beforeEach(() => {
    prisma = {
      teacher: { findFirst: jest.fn() },
      staff: { findFirst: jest.fn() },
      leaveRequest: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
    };
    schools = { findOneAccessibleOrThrow: jest.fn().mockResolvedValue(undefined) };
    notifications = { notifyUser: jest.fn().mockResolvedValue(undefined) };
    audit = { record: jest.fn().mockResolvedValue(undefined) };
    service = new LeaveRequestsService(
      prisma as unknown as PrismaService,
      schools as unknown as SchoolsService,
      notifications as unknown as NotificationsService,
      audit as unknown as AuditService,
    );
  });

  const baseDto = { type: "ANNUAL" as const, startDate: "2027-01-05", endDate: "2027-01-10" };

  it("rejects a request naming neither a teacher nor a staff member", async () => {
    await expect(service.create(ACTOR, "school-1", { ...baseDto })).rejects.toThrow(BadRequestException);
    expect(prisma.leaveRequest.create).not.toHaveBeenCalled();
  });

  it("rejects a request naming both a teacher and a staff member", async () => {
    await expect(
      service.create(ACTOR, "school-1", { ...baseDto, teacherId: "teacher-1", staffId: "staff-1" }),
    ).rejects.toThrow(BadRequestException);
    expect(prisma.leaveRequest.create).not.toHaveBeenCalled();
  });

  it("rejects a teacher that does not belong to this school", async () => {
    prisma.teacher.findFirst.mockResolvedValue(null);

    await expect(service.create(ACTOR, "school-1", { ...baseDto, teacherId: "teacher-other-school" })).rejects.toThrow(
      BadRequestException,
    );
  });

  it("rejects endDate before startDate", async () => {
    prisma.staff.findFirst.mockResolvedValue({ id: "staff-1" });

    await expect(
      service.create(ACTOR, "school-1", { ...baseDto, staffId: "staff-1", startDate: "2027-01-10", endDate: "2027-01-05" }),
    ).rejects.toThrow(BadRequestException);
    expect(prisma.leaveRequest.create).not.toHaveBeenCalled();
  });

  it("creates a PENDING leave request for a valid staff member and records an audit entry", async () => {
    prisma.staff.findFirst.mockResolvedValue({ id: "staff-1" });
    prisma.leaveRequest.create.mockResolvedValue({
      id: "leave-1",
      teacher: null,
      staff: { firstName: "Amal", lastName: "Nur" },
    });

    await service.create(ACTOR, "school-1", { ...baseDto, staffId: "staff-1" });

    expect(prisma.leaveRequest.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ staffId: "staff-1", teacherId: undefined, requestedByUserId: "user-1" }),
      }),
    );
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: "LEAVE_REQUESTED" }));
  });

  it("refuses to approve a leave request that is not PENDING", async () => {
    prisma.leaveRequest.findFirst.mockResolvedValue({ id: "leave-1", status: "APPROVED" });

    await expect(service.approve(ACTOR, "school-1", "leave-1")).rejects.toThrow(BadRequestException);
    expect(prisma.leaveRequest.update).not.toHaveBeenCalled();
  });

  it("throws NotFoundException approving a leave request outside this school", async () => {
    prisma.leaveRequest.findFirst.mockResolvedValue(null);

    await expect(service.approve(ACTOR, "school-1", "leave-x")).rejects.toThrow(NotFoundException);
  });

  it("notifies the teacher's own portal account once approved", async () => {
    prisma.leaveRequest.findFirst.mockResolvedValue({ id: "leave-1", status: "PENDING", teacherId: "teacher-1", staffId: null, type: "SICK" });
    prisma.leaveRequest.update.mockResolvedValue({ id: "leave-1", status: "APPROVED" });
    prisma.teacher.findFirst.mockResolvedValue({ userId: "teacher-user-1" });

    await service.approve(ACTOR, "school-1", "leave-1");

    expect(prisma.teacher.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "teacher-1" } }));
    expect(notifications.notifyUser).toHaveBeenCalledWith(
      "teacher-user-1",
      expect.objectContaining({ title: "Leave request approved" }),
    );
  });

  it("skips notifying when the staff member has no portal account", async () => {
    prisma.leaveRequest.findFirst.mockResolvedValue({ id: "leave-1", status: "PENDING", teacherId: null, staffId: "staff-1", type: "ANNUAL" });
    prisma.leaveRequest.update.mockResolvedValue({ id: "leave-1", status: "REJECTED" });
    prisma.staff.findFirst.mockResolvedValue({ userId: null });

    await service.reject(ACTOR, "school-1", "leave-1", { reason: "understaffed" });

    expect(notifications.notifyUser).not.toHaveBeenCalled();
  });
});
