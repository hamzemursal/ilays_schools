import { IsDateString, IsInt, IsOptional, IsUUID, Max, Min } from "class-validator";

export class CreateExamSubjectDto {
  @IsUUID()
  classId!: string;

  @IsUUID()
  subjectId!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1000)
  maxMarks?: number;

  // Must not exceed maxMarks - checked in ExamsService.createExamSubject.
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1000)
  passingMark?: number;

  @IsOptional()
  @IsDateString()
  examDate?: string;
}
