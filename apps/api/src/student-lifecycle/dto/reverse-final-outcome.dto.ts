import { IsOptional, IsString, MaxLength } from "class-validator";

export class ReverseFinalOutcomeDto {
  // Why the graduation/completion is being undone — kept in the audit log.
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
