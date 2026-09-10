import { IsNumber, IsOptional, IsPositive, IsString, IsUUID, MinLength } from "class-validator";

// Deliberately small — per the ZAAD requirement, a parent must never be
// asked to fill a large form. providerTransactionReference/payerPhone are
// optional because a parent may not have them handy at submission time;
// Finance resolves ambiguity during verification instead of blocking here.
export class CreatePaymentSubmissionDto {
  @IsNumber()
  @IsPositive()
  amount!: number;

  // Plain string, not an enum — a new provider needs no schema/code change.
  @IsOptional()
  @IsString()
  provider?: string;

  @IsOptional()
  @IsString()
  providerTransactionReference?: string;

  @IsOptional()
  @IsString()
  payerPhone?: string;

  @IsOptional()
  @IsString()
  payerName?: string;

  @IsOptional()
  @IsString()
  note?: string;

  // Finance may already know which invoice/charge this is for when logging a
  // direct-deposit-they-discovered submission; a parent's own submission
  // typically omits both and Finance matches it during verification.
  @IsOptional()
  @IsUUID()
  invoiceId?: string;

  @IsOptional()
  @IsUUID()
  chargeId?: string;
}

// Same shape as the guardian-submitted one, plus which student it's for —
// the guardian path never needs this since it's the caller's own child.
export class CreatePaymentSubmissionFromFinanceDto extends CreatePaymentSubmissionDto {
  @IsUUID()
  studentId!: string;
}

export class RejectPaymentSubmissionDto {
  @IsString()
  @MinLength(1)
  reason!: string;
}

export class VerifyPaymentSubmissionDto {
  @IsOptional()
  @IsUUID()
  invoiceId?: string;

  @IsOptional()
  @IsUUID()
  chargeId?: string;
}
