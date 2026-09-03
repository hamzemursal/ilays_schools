import { Module } from "@nestjs/common";
import { SchoolsModule } from "../schools/schools.module";
import { AuditModule } from "../audit/audit.module";
import { GuardiansController } from "./guardians.controller";
import { GuardianPortalController } from "./guardian-portal.controller";
import { GuardiansService } from "./guardians.service";
import { GuardianPortalService } from "./guardian-portal.service";

@Module({
  imports: [SchoolsModule, AuditModule],
  controllers: [GuardiansController, GuardianPortalController],
  providers: [GuardiansService, GuardianPortalService],
  exports: [GuardiansService],
})
export class GuardiansModule {}
