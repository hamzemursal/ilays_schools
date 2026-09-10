import { Module } from "@nestjs/common";
import { SchoolsModule } from "../schools/schools.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { AuditModule } from "../audit/audit.module";
import { SalaryHistoryController } from "./salary-history.controller";
import { SalaryHistoryService } from "./salary-history.service";
import { StaffAdvancesController } from "./staff-advances.controller";
import { StaffAdvancesService } from "./staff-advances.service";
import { PayrollPeriodsController } from "./payroll-periods.controller";
import { PayrollPeriodsService } from "./payroll-periods.service";
import { PayslipsController } from "./payslips.controller";
import { PayslipsService } from "./payslips.service";

@Module({
  imports: [SchoolsModule, NotificationsModule, AuditModule],
  controllers: [SalaryHistoryController, StaffAdvancesController, PayrollPeriodsController, PayslipsController],
  providers: [SalaryHistoryService, StaffAdvancesService, PayrollPeriodsService, PayslipsService],
  exports: [SalaryHistoryService],
})
export class PayrollModule {}
