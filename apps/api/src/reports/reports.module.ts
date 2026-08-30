import { Module } from "@nestjs/common";
import { SchoolsModule } from "../schools/schools.module";
import { ReportsController } from "./reports.controller";
import { ReportsService } from "./reports.service";

@Module({
  imports: [SchoolsModule],
  controllers: [ReportsController],
  providers: [ReportsService],
})
export class ReportsModule {}
