import { IsDateString, IsInt, IsOptional, Max, Min } from "class-validator";

// The Admin-only edit of one exam subject (route is results.approve - a
// Teacher has results.enter/results.view only and can never reach it):
// exam date, maximum marks, and pass mark. Class and subject stay fixed once
// results may already reference this row. `passingMark: null` clears it.
// Cross-field rules (pass mark <= maximum marks, maximum marks not below an
// existing mark, no change once results are approved/published) need the
// current row, so they live in ExamsService.updateExamSubject.
export class UpdateExamSubjectDto {
  @IsOptional()
  @IsDateString()
  examDate?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1000)
  maxMarks?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1000)
  passingMark?: number | null;
}
