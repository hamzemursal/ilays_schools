import { IsDateString, IsString, IsUUID, MinLength } from "class-validator";

export class CreateBillingPeriodDto {
  @IsUUID()
  academicYearId!: string;

  // e.g. "January 2027" or "Term 1"
  @IsString()
  @MinLength(1)
  name!: string;

  @IsDateString()
  startDate!: string;

  @IsDateString()
  endDate!: string;
}
