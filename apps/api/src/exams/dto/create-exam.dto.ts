import { IsEnum, IsString, IsUUID, MinLength } from "class-validator";
import { ExamType } from "@school-erp/database";

export class CreateExamDto {
  @IsUUID()
  academicYearId!: string;

  @IsString()
  @MinLength(1)
  name!: string;

  @IsEnum(ExamType)
  type!: ExamType;
}
