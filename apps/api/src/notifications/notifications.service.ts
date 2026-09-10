import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import type { AuthenticatedUser } from "../auth/types/authenticated-user";

export interface NotificationInput {
  title: string;
  body: string;
  actionUrl?: string;
}

// Distinct from AuditService by design (Part 16's own instruction: "Do NOT
// mix notifications with Audit Logs"). Audit is an immutable, complete
// record of what happened, written for every state change regardless of
// who's watching. This is the much smaller, mutable ("isRead") subset of
// events a specific person actually needs to see in their own Bell dropdown
// — a return/approve/publish/submit event writes to both, for two different
// audiences and two different lifetimes.
@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async notifyUser(userId: string, notif: NotificationInput) {
    await this.prisma.notification.create({ data: { userId, ...notif } });
  }

  // Guardian Portal reads its own notifications by guardianId, not userId
  // (see GuardianPortalService.myNotifications) — a guardian's portal login
  // is optional, so this is the FK the Notification actually needs, same
  // convention as the direct guardianId writes in AnnouncementsService.
  async notifyGuardian(guardianId: string, notif: NotificationInput) {
    await this.prisma.notification.create({ data: { guardianId, ...notif } });
  }

  // Every user assigned to this school (via UserSchool) whose role grants
  // the given permission — e.g. every School Admin who can actually act on
  // a submission, never every user in the org. A Super Admin with no
  // explicit UserSchool row for this school is deliberately not included:
  // their org-wide access already comes with an org-wide volume of this
  // kind of event, and they were never meant to be paged for every single
  // school's routine exam activity.
  async notifySchoolStaffWithPermission(schoolId: string, permissionKey: string, notif: NotificationInput) {
    const staff = await this.prisma.userRole.findMany({
      where: {
        user: { schools: { some: { schoolId } } },
        role: { permissions: { some: { permission: { key: permissionKey } } } },
      },
      select: { userId: true },
      distinct: ["userId"],
    });
    if (staff.length === 0) return;
    await this.prisma.notification.createMany({
      data: staff.map((s) => ({ userId: s.userId, ...notif })),
    });
  }

  async myNotifications(actor: AuthenticatedUser) {
    return this.prisma.notification.findMany({
      where: { userId: actor.id },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
  }

  async markRead(actor: AuthenticatedUser, notificationId: string) {
    const notification = await this.prisma.notification.findFirst({
      where: { id: notificationId, userId: actor.id },
    });
    if (!notification) throw new NotFoundException("Notification not found");
    return this.prisma.notification.update({ where: { id: notificationId }, data: { isRead: true } });
  }
}
