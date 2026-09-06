import { IsDateString, IsOptional } from "class-validator";

// Currently just examDate — the one field the "Add subject" form has no way
// to set later, once an exam subject already exists (see
// ExamsService.updateExamSubject). Not a general-purpose PATCH: class,
// subject, and maxMarks stay fixed once results may already reference them.
export class UpdateExamSubjectDto {
  @IsOptional()
  @IsDateString()
  examDate?: string;
}
