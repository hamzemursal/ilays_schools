import { Module } from "@nestjs/common";
import { StudentsModule } from "../students/students.module";
import { SchoolsModule } from "../schools/schools.module";
import { GuardiansModule } from "../guardians/guardians.module";
import { DocumentsController } from "./documents.controller";
import { GuardianChildPhotoController } from "./guardian-child-photo.controller";
import { SchoolLogoController } from "./school-logo.controller";
import { DocumentsService } from "./documents.service";

@Module({
  imports: [StudentsModule, SchoolsModule, GuardiansModule],
  controllers: [DocumentsController, GuardianChildPhotoController, SchoolLogoController],
  providers: [DocumentsService],
  exports: [DocumentsService],
})
export class DocumentsModule {}
