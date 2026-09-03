import { Module } from "@nestjs/common";
import { SchoolsModule } from "../schools/schools.module";
import { StudentsModule } from "../students/students.module";
import { AuditModule } from "../audit/audit.module";
import { AttendanceController } from "./attendance.controller";
import { AttendanceService } from "./attendance.service";

@Module({
  imports: [SchoolsModule, StudentsModule, AuditModule],
  controllers: [AttendanceController],
  providers: [AttendanceService],
})
export class AttendanceModule {}
