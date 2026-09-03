import { Module } from "@nestjs/common";
import { SchoolsModule } from "../schools/schools.module";
import { StudentsModule } from "../students/students.module";
import { AuditModule } from "../audit/audit.module";
import { FeeStructuresController } from "./fee-structures.controller";
import { FeeStructuresService } from "./fee-structures.service";
import { InvoicesController } from "./invoices.controller";
import { InvoicesService } from "./invoices.service";

@Module({
  imports: [SchoolsModule, StudentsModule, AuditModule],
  controllers: [FeeStructuresController, InvoicesController],
  providers: [FeeStructuresService, InvoicesService],
  exports: [InvoicesService],
})
export class FinanceModule {}
