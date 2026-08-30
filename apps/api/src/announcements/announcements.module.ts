import { Module } from "@nestjs/common";
import { SchoolsModule } from "../schools/schools.module";
import { AnnouncementsController } from "./announcements.controller";
import { AnnouncementsService } from "./announcements.service";

@Module({
  imports: [SchoolsModule],
  controllers: [AnnouncementsController],
  providers: [AnnouncementsService],
})
export class AnnouncementsModule {}
