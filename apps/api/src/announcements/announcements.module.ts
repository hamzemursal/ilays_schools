import { Module } from "@nestjs/common";
import { SchoolsModule } from "../schools/schools.module";
import { AnnouncementsController, MyAnnouncementsController } from "./announcements.controller";
import { AnnouncementAudienceService } from "./announcement-audience.service";
import { AnnouncementsService } from "./announcements.service";

@Module({
  imports: [SchoolsModule],
  controllers: [AnnouncementsController, MyAnnouncementsController],
  providers: [AnnouncementsService, AnnouncementAudienceService],
  exports: [AnnouncementAudienceService],
})
export class AnnouncementsModule {}
