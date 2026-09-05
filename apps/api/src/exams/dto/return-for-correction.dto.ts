import { IsString, MinLength } from "class-validator";

export class ReturnForCorrectionDto {
  @IsString()
  @MinLength(1)
  reason!: string;
}
