import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  MinLength,
  ValidateNested,
} from "class-validator";
import { ExamType } from "@school-erp/database";

class ExamSubjectPairDto {
  @IsUUID()
  classId!: string;

  @IsUUID()
  subjectId!: string;
}

export class CreateExamDto {
  @IsUUID()
  academicYearId!: string;

  @IsString()
  @MinLength(1)
  name!: string;

  @IsEnum(ExamType)
  type!: ExamType;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsString()
  description?: string;

  // The Create Exam wizard's bulk step: every (class, subject) pair the
  // admin selected, created as ExamSubject rows in the same transaction as
  // the Exam itself — each pair must be a real ClassSubject relationship
  // (ExamsService.createExam re-validates this; the wizard's own subject
  // list is already scoped to selected classes, but the backend never
  // trusts that alone). Optional so the plain "Add exam" path (no subjects
  // yet, added later one at a time) keeps working unchanged.
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => ExamSubjectPairDto)
  examSubjects?: ExamSubjectPairDto[];

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1000)
  maxMarks?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1000)
  passingMark?: number;

  // Applied to every bulk-created ExamSubject above — still editable
  // per-subject afterward via the existing inline date editor.
  @IsOptional()
  @IsDateString()
  examDate?: string;
}
