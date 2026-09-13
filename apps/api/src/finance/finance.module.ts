import { Module } from "@nestjs/common";
import { SchoolsModule } from "../schools/schools.module";
import { StudentsModule } from "../students/students.module";
import { GuardiansModule } from "../guardians/guardians.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { AuditModule } from "../audit/audit.module";
import { FeeStructuresController } from "./fee-structures.controller";
import { FeeStructuresService } from "./fee-structures.service";
import { InvoicesController } from "./invoices.controller";
import { InvoicesService } from "./invoices.service";
import { BillingPeriodsController } from "./billing-periods.controller";
import { BillingPeriodsService } from "./billing-periods.service";
import { ChargesController } from "./charges.controller";
import { ChargesService } from "./charges.service";
import { FeeAdjustmentsController } from "./fee-adjustments.controller";
import { FeeAdjustmentsService } from "./fee-adjustments.service";
import { PaymentsController } from "./payments.controller";
import { PaymentsService } from "./payments.service";
import { StudentLedgerController } from "./student-ledger.controller";
import { StudentLedgerService } from "./student-ledger.service";
import { PaymentSubmissionsController } from "./payment-submissions.controller";
import { GuardianPaymentSubmissionsController } from "./guardian-payment-submissions.controller";
import { PaymentSubmissionsService } from "./payment-submissions.service";
import { FinanceDashboardController } from "./finance-dashboard.controller";
import { CentralFinanceDashboardController } from "./central-finance-dashboard.controller";
import { FinanceDashboardService } from "./finance-dashboard.service";
import { ExpenseCategoriesController } from "./expense-categories.controller";
import { ExpenseCategoriesService } from "./expense-categories.service";
import { ExpensesController } from "./expenses.controller";
import { ExpensesService } from "./expenses.service";

@Module({
  imports: [SchoolsModule, StudentsModule, GuardiansModule, NotificationsModule, AuditModule],
  controllers: [
    FeeStructuresController,
    InvoicesController,
    BillingPeriodsController,
    ChargesController,
    FeeAdjustmentsController,
    PaymentsController,
    StudentLedgerController,
    PaymentSubmissionsController,
    GuardianPaymentSubmissionsController,
    FinanceDashboardController,
    CentralFinanceDashboardController,
    ExpenseCategoriesController,
    ExpensesController,
  ],
  providers: [
    FeeStructuresService,
    InvoicesService,
    BillingPeriodsService,
    ChargesService,
    FeeAdjustmentsService,
    PaymentsService,
    StudentLedgerService,
    PaymentSubmissionsService,
    FinanceDashboardService,
    ExpenseCategoriesService,
    ExpensesService,
  ],
  // StudentLedgerService exported for StudentDirectoryModule's bulk fee
  // summary column — same reasoning as AttendanceModule's export: avoids a
  // FinanceModule <-> StudentsModule cycle (StudentLedgerService already
  // depends on StudentsService).
  exports: [InvoicesService, StudentLedgerService],
})
export class FinanceModule {}
