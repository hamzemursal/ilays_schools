import { Module } from "@nestjs/common";
import { SchoolsModule } from "../schools/schools.module";
import { AuditModule } from "../audit/audit.module";
import { PromotionsController } from "./promotions.controller";
import { PromotionsService } from "./promotions.service";

@Module({
  imports: [SchoolsModule, AuditModule],
  controllers: [PromotionsController],
  providers: [PromotionsService],
})
export class PromotionsModule {}
