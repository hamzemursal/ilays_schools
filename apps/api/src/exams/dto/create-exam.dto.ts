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

  // Required for every NEW exam: an exam only counts toward Term/Annual
  // results (and Promotion) through this link, so one created without it
  // would silently contribute to neither term. The column stays nullable
  // only so exams created before Terms existed are preserved untouched —
  // they can be assigned a term afterwards (see ExamsService.updateExamTerm).
  @IsUUID()
  termId!: string;

  @IsString()
  @MinLength(1)
  name!: string;

  // Optional, free-form metadata only - Term (above) is the one authoritative
  // academic period. New exams no longer collect it (defaults to OTHER);
  // the enum keeps every historical value so no existing row is touched.
  @IsOptional()
  @IsEnum(ExamType)
  type?: ExamType;

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
