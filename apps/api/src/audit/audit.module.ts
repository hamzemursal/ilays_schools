import { Module, forwardRef } from "@nestjs/common";
import { SchoolsModule } from "../schools/schools.module";
import { AuditController } from "./audit.controller";
import { AuditService } from "./audit.service";

// forwardRef in both directions: AuditService's own list()/listForSchool()
// need SchoolsService's ownership check, and SchoolsService now records
// audit events through AuditService for its own school.create/delete/
// invite-admin actions — a genuine two-way dependency, not an accident.
@Module({
  imports: [forwardRef(() => SchoolsModule)],
  controllers: [AuditController],
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
