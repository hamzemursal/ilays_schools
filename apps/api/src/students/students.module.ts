import { Module } from "@nestjs/common";
import { SchoolsModule } from "../schools/schools.module";
import { GuardiansModule } from "../guardians/guardians.module";
import { AuditModule } from "../audit/audit.module";
import { StudentsController } from "./students.controller";
import { StudentsService } from "./students.service";
import { StudentPortalService } from "./student-portal.service";

@Module({
  imports: [SchoolsModule, GuardiansModule, AuditModule],
  controllers: [StudentsController],
  providers: [StudentsService, StudentPortalService],
  exports: [StudentsService],
})
export class StudentsModule {}
