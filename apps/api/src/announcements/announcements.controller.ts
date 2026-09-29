import { Body, Controller, Get, HttpCode, Param, Post, Query } from "@nestjs/common";
import { AnnouncementsService } from "./announcements.service";
import { AnnouncementTargetDto, CreateAnnouncementDto } from "./dto/create-announcement.dto";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { RequirePermissions } from "../auth/decorators/require-permissions.decorator";
import type { AuthenticatedUser } from "../auth/types/authenticated-user";

@Controller("schools/:schoolId/announcements")
export class AnnouncementsController {
  constructor(private readonly announcements: AnnouncementsService) {}

  @RequirePermissions("announcements.view")
  @Get()
  list(@CurrentUser() user: AuthenticatedUser, @Param("schoolId") schoolId: string) {
    return this.announcements.listForSchool(user, schoolId);
  }

  @RequirePermissions("announcements.manage")
  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param("schoolId") schoolId: string,
    @Body() dto: CreateAnnouncementDto,
  ) {
    return this.announcements.create(user, schoolId, dto);
  }

  @RequirePermissions("announcements.manage")
  @Post("preview")
  @HttpCode(200)
  preview(@CurrentUser() user: AuthenticatedUser, @Param("schoolId") schoolId: string, @Body() dto: AnnouncementTargetDto) {
    return this.announcements.preview(user, schoolId, dto);
  }

  @RequirePermissions("announcements.manage")
  @Get("recipient-options")
  recipientOptions(@CurrentUser() user: AuthenticatedUser, @Param("schoolId") schoolId: string, @Query("q") q?: string) {
    return this.announcements.recipientOptions(user, schoolId, q);
  }
}

// Any signed-in user's own inbox — teachers and staff included. It only
// ever returns announcements delivered to the caller, so no permission is
// needed beyond being signed in.
@Controller("announcements")
export class MyAnnouncementsController {
  constructor(private readonly announcements: AnnouncementsService) {}

  @Get("me")
  mine(@CurrentUser() user: AuthenticatedUser) {
    return this.announcements.mine(user);
  }
}
