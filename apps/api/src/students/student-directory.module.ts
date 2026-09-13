import { Module } from "@nestjs/common";
import { SchoolsModule } from "../schools/schools.module";
import { StudentsModule } from "./students.module";
import { AttendanceModule } from "../attendance/attendance.module";
import { FinanceModule } from "../finance/finance.module";
import { StudentDirectoryController } from "./student-directory.controller";
import { StudentDirectoryService } from "./student-directory.service";

// Deliberately its own module rather than folding into StudentsModule:
// AttendanceModule and FinanceModule both already import StudentsModule
// (AttendanceService/StudentLedgerService depend on StudentsService), so
// StudentsModule importing either of them back would be a cycle. This
// module sits "above" all three instead, importing each normally.
@Module({
  imports: [SchoolsModule, StudentsModule, AttendanceModule, FinanceModule],
  controllers: [StudentDirectoryController],
  providers: [StudentDirectoryService],
})
export class StudentDirectoryModule {}
