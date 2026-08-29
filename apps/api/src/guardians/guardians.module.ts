import { Module } from "@nestjs/common";
import { SchoolsModule } from "../schools/schools.module";
import { GuardiansController } from "./guardians.controller";
import { GuardiansService } from "./guardians.service";

@Module({
  imports: [SchoolsModule],
  controllers: [GuardiansController],
  providers: [GuardiansService],
  exports: [GuardiansService],
})
export class GuardiansModule {}
