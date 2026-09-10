import { IsDateString, IsEnum, IsNumber, IsOptional, IsPositive, IsString, IsUUID, MinLength } from "class-validator";
import { FeeAdjustmentType } from "@school-erp/database";

export class CreateFeeAdjustmentDto {
  @IsUUID()
  enrollmentId!: string;

  // At most one of invoiceId/chargeId — omit both for a general credit
  // against the enrollment rather than one specific charge.
  @IsOptional()
  @IsUUID()
  invoiceId?: string;

  @IsOptional()
  @IsUUID()
  chargeId?: string;

  @IsEnum(FeeAdjustmentType)
  type!: FeeAdjustmentType;

  @IsNumber()
  @IsPositive()
  amount!: number;

  @IsString()
  @MinLength(1)
  reason!: string;

  @IsOptional()
  @IsDateString()
  effectiveFrom?: string;

  @IsOptional()
  @IsDateString()
  effectiveTo?: string;
}
