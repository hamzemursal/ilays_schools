import { Module } from "@nestjs/common";
import { SchoolsModule } from "../schools/schools.module";
import { AuditModule } from "../audit/audit.module";
import { DocumentsModule } from "../documents/documents.module";
import { ExamsController } from "./exams.controller";
import { MyExamsController } from "./my-exams.controller";
import { ExamPapersController } from "./exam-papers.controller";
import { ExamsService } from "./exams.service";

@Module({
  imports: [SchoolsModule, AuditModule, DocumentsModule],
  controllers: [ExamsController, MyExamsController, ExamPapersController],
  providers: [ExamsService],
})
export class ExamsModule {}
