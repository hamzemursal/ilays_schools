import { Module, forwardRef } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { SchoolsController } from "./schools.controller";
import { SchoolsService } from "./schools.service";

@Module({
  imports: [forwardRef(() => AuditModule)],
  controllers: [SchoolsController],
  providers: [SchoolsService],
  exports: [SchoolsService],
})
export class SchoolsModule {}
