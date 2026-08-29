import { Module } from "@nestjs/common";
import { SchoolsModule } from "../schools/schools.module";
import { DocumentsModule } from "../documents/documents.module";
import { GuardiansModule } from "../guardians/guardians.module";
import { TeachersController } from "./teachers.controller";
import { MyTeachingController } from "./my-teaching.controller";
import { TeachersService } from "./teachers.service";

@Module({
  imports: [SchoolsModule, DocumentsModule, GuardiansModule],
  controllers: [TeachersController, MyTeachingController],
  providers: [TeachersService],
  exports: [TeachersService],
})
export class TeachersModule {}
