import { IsEnum, IsNumber, IsOptional, IsPositive, IsString } from "class-validator";
import { PaymentMethod } from "@school-erp/database";

export class RecordPaymentDto {
  @IsNumber()
  @IsPositive()
  amount!: number;

  @IsOptional()
  @IsEnum(PaymentMethod)
  method?: PaymentMethod;

  @IsOptional()
  @IsString()
  reference?: string;
}
