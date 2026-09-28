import { Module } from "@nestjs/common";
import { SchoolsModule } from "../schools/schools.module";
import { AuditModule } from "../audit/audit.module";
import { ExamsModule } from "../exams/exams.module";
import { PromotionsController, PromotionsOverviewController } from "./promotions.controller";
import { PromotionsService } from "./promotions.service";

@Module({
  imports: [SchoolsModule, AuditModule, ExamsModule],
  controllers: [PromotionsController, PromotionsOverviewController],
  providers: [PromotionsService],
})
export class PromotionsModule {}
