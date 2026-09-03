import { Module } from "@nestjs/common";
import { SchoolsModule } from "../schools/schools.module";
import { AuditModule } from "../audit/audit.module";
import { TransfersController } from "./transfers.controller";
import { TransfersService } from "./transfers.service";

@Module({
  imports: [SchoolsModule, AuditModule],
  controllers: [TransfersController],
  providers: [TransfersService],
})
export class TransfersModule {}
