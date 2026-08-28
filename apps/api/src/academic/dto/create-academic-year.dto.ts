import { IsBoolean, IsDateString, IsOptional, IsString, MinLength } from "class-validator";

export class CreateAcademicYearDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsDateString()
  startDate!: string;

  @IsDateString()
  endDate!: string;

  @IsOptional()
  @IsBoolean()
  isCurrent?: boolean;
}
