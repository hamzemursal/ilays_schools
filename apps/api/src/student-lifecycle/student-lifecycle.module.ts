import { Module } from "@nestjs/common";
import { SchoolsModule } from "../schools/schools.module";
import { AuditModule } from "../audit/audit.module";
import { StudentLifecycleController } from "./student-lifecycle.controller";
import { StudentLifecycleService } from "./student-lifecycle.service";

@Module({
  imports: [SchoolsModule, AuditModule],
  controllers: [StudentLifecycleController],
  providers: [StudentLifecycleService],
})
export class StudentLifecycleModule {}
