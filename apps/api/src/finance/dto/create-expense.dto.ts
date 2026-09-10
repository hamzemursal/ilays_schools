import { IsDateString, IsNumber, IsOptional, IsPositive, IsString, IsUUID, MinLength } from "class-validator";

export class CreateExpenseDto {
  @IsOptional()
  @IsUUID()
  expenseCategoryId?: string;

  @IsString()
  @MinLength(1)
  description!: string;

  @IsNumber()
  @IsPositive()
  amount!: number;

  @IsDateString()
  expenseDate!: string;
}

export class RejectExpenseDto {
  @IsString()
  @MinLength(1)
  reason!: string;
}
