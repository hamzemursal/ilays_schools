import { Controller, Get, Param, Patch } from "@nestjs/common";
import { NotificationsService } from "./notifications.service";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import type { AuthenticatedUser } from "../auth/types/authenticated-user";

// Every authenticated user has a Bell — no @RequirePermissions gate here,
// same as the guardian-portal notification routes this mirrors. Ownership
// (userId = actor.id) is the only access control that's ever needed.
@Controller("notifications")
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.notifications.myNotifications(user);
  }

  @Patch(":id/read")
  markRead(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return this.notifications.markRead(user, id);
  }
}
