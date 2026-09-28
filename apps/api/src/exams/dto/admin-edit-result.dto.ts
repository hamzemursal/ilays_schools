import { IsBoolean, IsNumber, IsOptional, IsString, Min, ValidateIf } from "class-validator";

// A single, already-existing result being corrected directly by an Admin —
// unlike EnterMarksDto's bulk `entries[]` (a teacher's whole-section sheet),
// this targets exactly one enrollment's mark and works regardless of the
// ResultSubmission's status (see ExamsService.adminEditResult), including
// after publish. Same isAbsent/marksObtained shape and validation as
// MarkEntryDto — one value or the other, never both, never fabricated.
export class AdminEditResultDto {
  @IsOptional()
  @IsBoolean()
  isAbsent?: boolean;

  @ValidateIf((o: AdminEditResultDto) => !o.isAbsent)
  @IsNumber({ maxDecimalPlaces: 2 }, { message: "Each mark must be a number with at most 2 decimal places" })
  @Min(0, { message: "A mark can't be negative" })
  marksObtained?: number;

  // Optional, unlike UnpublishResultsDto's mandatory reason — an in-place
  // correction doesn't remove anything a student can already see, it just
  // fixes what they see, so recording why is encouraged, not required.
  @IsOptional()
  @IsString()
  reason?: string;
}
