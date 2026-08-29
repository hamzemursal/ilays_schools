import { IsDateString, IsEmail, IsEnum, IsOptional, IsString, MinLength } from "class-validator";
import { Sex, TeacherStatus } from "@school-erp/database";

// School Admin only (see TeachersController) — every field here is
// administrative/HR data. Self-service edits go through
// UpdateMyTeacherProfileDto instead, which exposes a strict subset.
export class UpdateTeacherDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  firstName?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  lastName?: string;

  @IsOptional()
  @IsEnum(Sex)
  sex?: Sex;

  @IsOptional()
  @IsDateString()
  dateOfBirth?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  qualification?: string;

  @IsOptional()
  @IsString()
  specialization?: string;

  @IsOptional()
  @IsDateString()
  employmentDate?: string;

  @IsOptional()
  @IsEnum(TeacherStatus)
  status?: TeacherStatus;

  @IsOptional()
  @IsString()
  emergencyContactName?: string;

  @IsOptional()
  @IsString()
  emergencyContactPhone?: string;
}
