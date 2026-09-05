import { Module } from "@nestjs/common";
import { SchoolsModule } from "../schools/schools.module";
import { AuditModule } from "../audit/audit.module";
import { DocumentsModule } from "../documents/documents.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { ExamsController } from "./exams.controller";
import { MyExamsController } from "./my-exams.controller";
import { ExamPapersController } from "./exam-papers.controller";
import { ResultsReviewController } from "./results-review.controller";
import { ExamsService } from "./exams.service";

@Module({
  imports: [SchoolsModule, AuditModule, DocumentsModule, NotificationsModule],
  controllers: [ExamsController, MyExamsController, ExamPapersController, ResultsReviewController],
  providers: [ExamsService],
})
export class ExamsModule {}
