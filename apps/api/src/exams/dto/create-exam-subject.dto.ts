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

  @IsOptional()
  @IsDateString()
  examDate?: string;
}
