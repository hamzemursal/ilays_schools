import { IsNumber, IsOptional, IsPositive, IsString } from "class-validator";

// Exactly one of teacherId/staffId — enforced in PayslipsService.
export class CreatePayslipDto {
  @IsOptional()
  @IsString()
  teacherId?: string;

  @IsOptional()
  @IsString()
  staffId?: string;

  // Omit to pull the employee's current SalaryHistory.basicSalary.
  @IsOptional()
  @IsNumber()
  @IsPositive()
  basicSalary?: number;
}
