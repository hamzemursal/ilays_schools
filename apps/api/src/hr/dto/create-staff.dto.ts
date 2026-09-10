import { IsDateString, IsEmail, IsOptional, IsString, MinLength } from "class-validator";

export class CreateStaffDto {
  @IsString()
  @MinLength(1)
  firstName!: string;

  @IsString()
  @MinLength(1)
  lastName!: string;

  // Omit to auto-generate per the school's sequential numbering policy —
  // same convention as CreateTeacherDto.employeeNumber.
  @IsOptional()
  @IsString()
  staffNumber?: string;

  @IsOptional()
  @IsString()
  departmentId?: string;

  @IsOptional()
  @IsString()
  jobTitle?: string;

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
  @IsDateString()
  employmentDate?: string;
}
