import { IsEnum, IsNumber, IsPositive, IsString, MinLength } from "class-validator";
import { PayslipLineType } from "@school-erp/database";

// ADVANCE_REPAYMENT lines are never added through this endpoint — they're
// generated automatically by PayslipsService.calculate from the employee's
// own ACTIVE StaffAdvance rows. Rejected at runtime in the service (not
// expressible in the @IsEnum type itself) if someone tries anyway.
export class AddPayslipLineItemDto {
  @IsEnum(PayslipLineType)
  type!: PayslipLineType;

  @IsString()
  @MinLength(1)
  label!: string;

  @IsNumber()
  @IsPositive()
  amount!: number;
}
