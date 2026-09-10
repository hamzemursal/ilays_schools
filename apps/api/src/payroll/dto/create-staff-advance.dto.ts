import { IsNumber, IsOptional, IsPositive, IsString } from "class-validator";

export class CreateStaffAdvanceDto {
  @IsOptional()
  @IsString()
  teacherId?: string;

  @IsOptional()
  @IsString()
  staffId?: string;

  @IsNumber()
  @IsPositive()
  amount!: number;

  @IsNumber()
  @IsPositive()
  repaymentPerPeriod!: number;

  @IsOptional()
  @IsString()
  notes?: string;
}
