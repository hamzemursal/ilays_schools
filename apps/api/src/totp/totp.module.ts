import { Module } from "@nestjs/common";
import { TotpController } from "./totp.controller";
import { TotpService } from "./totp.service";
import { AuthModule } from "../auth/auth.module";
import { AuditModule } from "../audit/audit.module";

@Module({
  imports: [AuthModule, AuditModule],
  controllers: [TotpController],
  providers: [TotpService],
})
export class TotpModule {}
