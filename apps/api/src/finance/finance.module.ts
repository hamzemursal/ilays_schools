import { Module } from "@nestjs/common";
import { SchoolsModule } from "../schools/schools.module";
import { StudentsModule } from "../students/students.module";
import { FeeStructuresController } from "./fee-structures.controller";
import { FeeStructuresService } from "./fee-structures.service";
import { InvoicesController } from "./invoices.controller";
import { InvoicesService } from "./invoices.service";

@Module({
  imports: [SchoolsModule, StudentsModule],
  controllers: [FeeStructuresController, InvoicesController],
  providers: [FeeStructuresService, InvoicesService],
})
export class FinanceModule {}
