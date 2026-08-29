import { Module } from "@nestjs/common";
import { StudentsModule } from "../students/students.module";
import { TeachersModule } from "../teachers/teachers.module";
import { FinanceModule } from "../finance/finance.module";
import { ExportsController } from "./exports.controller";
import { ExportsService } from "./exports.service";

@Module({
  imports: [StudentsModule, TeachersModule, FinanceModule],
  controllers: [ExportsController],
  providers: [ExportsService],
})
export class ExportsModule {}
