import { Module } from "@nestjs/common";
import { SchoolsModule } from "../schools/schools.module";
import { DashboardController } from "./dashboard.controller";
import { DashboardService } from "./dashboard.service";

@Module({
  imports: [SchoolsModule],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
