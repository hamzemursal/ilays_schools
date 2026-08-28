import { Type } from "class-transformer";
import { IsArray, IsBoolean, IsDateString, IsEnum, IsOptional, IsString, MinLength, ValidateNested } from "class-validator";
import { Sex } from "@school-erp/database";
import { EnrollmentInputDto } from "./enrollment-input.dto";
import { GuardianInputDto } from "../../guardians/dto/guardian-input.dto";

export class CreateStudentDto {
  @IsString()
  @MinLength(1)
  firstName!: string;

  @IsString()
  @MinLength(1)
  lastName!: string;

  @IsDateString()
  dateOfBirth!: string;

  @IsEnum(Sex)
  sex!: Sex;

  @IsOptional()
  @IsString()
  legacyStudentNumber?: string;

  @ValidateNested()
  @Type(() => EnrollmentInputDto)
  enrollment!: EnrollmentInputDto;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => GuardianInputDto)
  guardians?: GuardianInputDto[];

  // Set only after the caller has been shown possibleDuplicates and chose to
  // proceed anyway. Never set by default — see StudentsService.create.
  @IsOptional()
  @IsBoolean()
  confirmDespiteDuplicates?: boolean;
}
