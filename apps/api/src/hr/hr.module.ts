import { Module } from "@nestjs/common";
import { SchoolsModule } from "../schools/schools.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { AuditModule } from "../audit/audit.module";
import { DepartmentsController } from "./departments.controller";
import { DepartmentsService } from "./departments.service";
import { StaffController } from "./staff.controller";
import { StaffService } from "./staff.service";
import { LeaveRequestsController } from "./leave-requests.controller";
import { LeaveRequestsService } from "./leave-requests.service";
import { StaffAttendanceController } from "./staff-attendance.controller";
import { StaffAttendanceService } from "./staff-attendance.service";

@Module({
  imports: [SchoolsModule, NotificationsModule, AuditModule],
  controllers: [DepartmentsController, StaffController, LeaveRequestsController, StaffAttendanceController],
  providers: [DepartmentsService, StaffService, LeaveRequestsService, StaffAttendanceService],
  exports: [StaffService],
})
export class HrModule {}
