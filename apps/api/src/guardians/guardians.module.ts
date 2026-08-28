import { Module } from "@nestjs/common";
import { GuardiansService } from "./guardians.service";

@Module({
  providers: [GuardiansService],
  exports: [GuardiansService],
})
export class GuardiansModule {}
