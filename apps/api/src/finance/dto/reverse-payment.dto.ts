import { IsString, MinLength } from "class-validator";

export class ReversePaymentDto {
  @IsString()
  @MinLength(1)
  reason!: string;
}
