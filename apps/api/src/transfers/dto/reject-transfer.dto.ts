import { IsString, MinLength } from "class-validator";

export class RejectTransferDto {
  @IsString()
  @MinLength(1)
  reason!: string;
}
