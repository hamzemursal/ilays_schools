import { IsDateString, IsString, MinLength } from "class-validator";

export class CreatePayrollPeriodDto {
  // e.g. "January 2027"
  @IsString()
  @MinLength(1)
  name!: string;

  @IsDateString()
  startDate!: string;

  @IsDateString()
  endDate!: string;
}
