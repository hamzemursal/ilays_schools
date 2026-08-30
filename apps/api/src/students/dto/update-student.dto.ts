import { Type } from "class-transformer";
import { IsDateString, IsEnum, IsOptional, IsString, MinLength, ValidateNested } from "class-validator";
import { Sex } from "@school-erp/database";
import { EnrollmentInputDto } from "./enrollment-input.dto";

export class UpdateStudentDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  firstName?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  lastName?: string;

  @IsOptional()
  @IsDateString()
  dateOfBirth?: string;

  @IsOptional()
  @IsEnum(Sex)
  sex?: Sex;

  @IsOptional()
  @IsString()
  legacyStudentNumber?: string;

  // Present only when the student's current active enrollment is being
  // corrected in place (class/section/academic year/roll number) — see
  // StudentsService.updateActiveEnrollment. studentNumber on this DTO is
  // ignored for updates; it never changes after admission.
  @IsOptional()
  @ValidateNested()
  @Type(() => EnrollmentInputDto)
  enrollment?: EnrollmentInputDto;
}
