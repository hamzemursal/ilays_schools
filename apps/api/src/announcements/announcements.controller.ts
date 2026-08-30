import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { AnnouncementsService } from "./announcements.service";
import { CreateAnnouncementDto } from "./dto/create-announcement.dto";
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
}
