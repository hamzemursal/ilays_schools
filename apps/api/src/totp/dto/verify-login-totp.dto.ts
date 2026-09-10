import { IsOptional, IsString } from "class-validator";

export class VerifyLoginTotpDto {
  @IsString()
  mfaToken!: string;

  // Exactly one of these two — enforced in TotpService, not here, matching
  // this codebase's convention for "at most/exactly one of" checks (see
  // e.g. PaymentSubmissionsService's invoiceId/chargeId handling).
  @IsOptional()
  @IsString()
  code?: string;

  @IsOptional()
  @IsString()
  recoveryCode?: string;
}
