import { Module } from "@nestjs/common";
import { StudentsModule } from "../students/students.module";
import { SchoolsModule } from "../schools/schools.module";
import { DocumentsController } from "./documents.controller";
import { DocumentsService } from "./documents.service";

@Module({
  imports: [StudentsModule, SchoolsModule],
  controllers: [DocumentsController],
  providers: [DocumentsService],
  exports: [DocumentsService],
})
export class DocumentsModule {}
