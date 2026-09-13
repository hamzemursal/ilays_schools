import { Module } from "@nestjs/common";
import { SchoolsModule } from "../schools/schools.module";
import { StudentsModule } from "../students/students.module";
import { AuditModule } from "../audit/audit.module";
import { DocumentsModule } from "../documents/documents.module";
import { AttendanceController } from "./attendance.controller";
import { AttendanceService } from "./attendance.service";

@Module({
  imports: [SchoolsModule, StudentsModule, AuditModule, DocumentsModule],
  controllers: [AttendanceController],
  providers: [AttendanceService],
  // Exported for StudentDirectoryModule's bulk "attendance today" column —
  // that module imports this one directly rather than StudentsModule
  // importing it back, which would create a StudentsModule <->
  // AttendanceModule cycle (AttendanceService already depends on
  // StudentsService).
  exports: [AttendanceService],
})
export class AttendanceModule {}
