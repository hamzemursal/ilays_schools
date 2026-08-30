import { IsBoolean, IsEmail, IsOptional, IsString, MinLength } from "class-validator";

export class CreateGuardianDto {
  @IsString()
  @MinLength(1)
  firstName!: string;

  @IsString()
  @MinLength(1)
  lastName!: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  address?: string;

  // Set only after the caller has been shown possibleDuplicates and chose to
  // proceed anyway — same pattern as CreateStudentDto.confirmDespiteDuplicates.
  @IsOptional()
  @IsBoolean()
  confirmDespiteDuplicates?: boolean;
}
