import { Module } from "@nestjs/common";
import { SchoolsModule } from "../schools/schools.module";
import { AuditController } from "./audit.controller";
import { AuditService } from "./audit.service";

@Module({
  imports: [SchoolsModule],
  controllers: [AuditController],
  providers: [AuditService],
})
export class AuditModule {}
