import { Module } from "@nestjs/common";
import { SchoolsModule } from "../schools/schools.module";
import { StudentsModule } from "../students/students.module";
import { AuditModule } from "../audit/audit.module";
import { ImportsController } from "./imports.controller";
import { ImportsService } from "./imports.service";

@Module({
  imports: [SchoolsModule, StudentsModule, AuditModule],
  controllers: [ImportsController],
  providers: [ImportsService],
})
export class ImportsModule {}
