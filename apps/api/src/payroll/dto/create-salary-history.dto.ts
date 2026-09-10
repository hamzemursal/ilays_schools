import { IsDateString, IsNumber, IsOptional, IsPositive, IsString } from "class-validator";

// Exactly one of teacherId/staffId — enforced in SalaryHistoryService, same
// convention as CreateLeaveRequestDto.
export class CreateSalaryHistoryDto {
  @IsOptional()
  @IsString()
  teacherId?: string;

  @IsOptional()
  @IsString()
  staffId?: string;

  @IsNumber()
  @IsPositive()
  basicSalary!: number;

  // Defaults to today — a raise takes effect from a specific date, it never
  // silently overwrites the prior salary row.
  @IsOptional()
  @IsDateString()
  effectiveFrom?: string;
}
