import { Module } from "@nestjs/common";
import { SchoolsModule } from "../schools/schools.module";
import { GuardiansModule } from "../guardians/guardians.module";
import { StudentsController } from "./students.controller";
import { StudentsService } from "./students.service";

@Module({
  imports: [SchoolsModule, GuardiansModule],
  controllers: [StudentsController],
  providers: [StudentsService],
  exports: [StudentsService],
})
export class StudentsModule {}
