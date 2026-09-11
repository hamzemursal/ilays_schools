import { NotFoundException } from "@nestjs/common";
import type { AuthenticatedUser } from "../auth/types/authenticated-user";
import { NotificationsService } from "./notifications.service";
import { PrismaService } from "../prisma/prisma.service";

const ACTOR: AuthenticatedUser = {
  id: "user-1",
  email: "teacher@example.com",
  organizationId: "org-1",
  roles: ["TEACHER"],
  permissions: [],
  schoolIds: ["school-1"],
};

type MockPrisma = {
  notification: { create: jest.Mock; findMany: jest.Mock; findFirst: jest.Mock; update: jest.Mock; createMany: jest.Mock };
  userRole: { findMany: jest.Mock };
};

function createMockPrisma(): MockPrisma {
  return {
    notification: { create: jest.fn(), findMany: jest.fn(), findFirst: jest.fn(), update: jest.fn(), createMany: jest.fn() },
    userRole: { findMany: jest.fn() },
  };
}

function createService(prisma: MockPrisma) {
  return new NotificationsService(prisma as unknown as PrismaService);
}

describe("NotificationsService.notifyUser / notifyGuardian", () => {
  it("notifyUser writes a Notification keyed by userId", async () => {
    const prisma = createMockPrisma();
    const service = createService(prisma);

    await service.notifyUser("user-1", { title: "Leave approved", body: "Your leave was approved." });

    expect(prisma.notification.create).toHaveBeenCalledWith({
      data: { userId: "user-1", title: "Leave approved", body: "Your leave was approved." },
    });
  });

  it("notifyGuardian writes a Notification keyed by guardianId, not userId", async () => {
    const prisma = createMockPrisma();
    const service = createService(prisma);

    await service.notifyGuardian("guardian-1", { title: "Payment verified", body: "Thanks." });

    expect(prisma.notification.create).toHaveBeenCalledWith({
      data: { guardianId: "guardian-1", title: "Payment verified", body: "Thanks." },
    });
  });

  it("carries actionUrl through when provided", async () => {
    const prisma = createMockPrisma();
    const service = createService(prisma);

    await service.notifyUser("user-1", { title: "T", body: "B", actionUrl: "/leave/123" });

    expect(prisma.notification.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ actionUrl: "/leave/123" }) }),
    );
  });
});

describe("NotificationsService.notifySchoolStaffWithPermission", () => {
  let prisma: MockPrisma;
  let service: NotificationsService;

  beforeEach(() => {
    prisma = createMockPrisma();
    service = createService(prisma);
  });

  it("queries users assigned to this school whose role grants the given permission", async () => {
    prisma.userRole.findMany.mockResolvedValue([]);

    await service.notifySchoolStaffWithPermission("school-1", "leave.approve", { title: "T", body: "B" });

    expect(prisma.userRole.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          user: { schools: { some: { schoolId: "school-1" } } },
          role: { permissions: { some: { permission: { key: "leave.approve" } } } },
        },
        distinct: ["userId"],
      }),
    );
  });

  it("writes one Notification per distinct matching staff member", async () => {
    prisma.userRole.findMany.mockResolvedValue([{ userId: "u1" }, { userId: "u2" }]);

    await service.notifySchoolStaffWithPermission("school-1", "leave.approve", { title: "New request", body: "Review it" });

    expect(prisma.notification.createMany).toHaveBeenCalledWith({
      data: [
        { userId: "u1", title: "New request", body: "Review it" },
        { userId: "u2", title: "New request", body: "Review it" },
      ],
    });
  });

  it("skips the write entirely — no empty-array createMany call — when no staff member matches", async () => {
    prisma.userRole.findMany.mockResolvedValue([]);

    await service.notifySchoolStaffWithPermission("school-1", "leave.approve", { title: "T", body: "B" });

    expect(prisma.notification.createMany).not.toHaveBeenCalled();
  });
});

describe("NotificationsService.myNotifications", () => {
  it("scopes to the actor's own userId, newest first, capped at 50", async () => {
    const prisma = createMockPrisma();
    prisma.notification.findMany.mockResolvedValue([]);
    const service = createService(prisma);

    await service.myNotifications(ACTOR);

    expect(prisma.notification.findMany).toHaveBeenCalledWith({
      where: { userId: "user-1" },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
  });
});

describe("NotificationsService.markRead", () => {
  let prisma: MockPrisma;
  let service: NotificationsService;

  beforeEach(() => {
    prisma = createMockPrisma();
    service = createService(prisma);
  });

  it("throws NotFoundException for a notification that doesn't belong to this user", async () => {
    prisma.notification.findFirst.mockResolvedValue(null);

    await expect(service.markRead(ACTOR, "notif-1")).rejects.toThrow(NotFoundException);
    expect(prisma.notification.update).not.toHaveBeenCalled();
  });

  it("scopes the ownership check by both id and the actor's own userId — never someone else's notification", async () => {
    prisma.notification.findFirst.mockResolvedValue({ id: "notif-1", userId: "user-1" });
    prisma.notification.update.mockResolvedValue({ id: "notif-1", isRead: true });

    await service.markRead(ACTOR, "notif-1");

    expect(prisma.notification.findFirst).toHaveBeenCalledWith({ where: { id: "notif-1", userId: "user-1" } });
  });

  it("marks it read", async () => {
    prisma.notification.findFirst.mockResolvedValue({ id: "notif-1", userId: "user-1" });
    prisma.notification.update.mockResolvedValue({ id: "notif-1", isRead: true });

    const result = await service.markRead(ACTOR, "notif-1");

    expect(prisma.notification.update).toHaveBeenCalledWith({ where: { id: "notif-1" }, data: { isRead: true } });
    expect(result).toEqual({ id: "notif-1", isRead: true });
  });
});
