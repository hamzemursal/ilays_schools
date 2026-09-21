import { Type } from "class-transformer";
import { IsArray, IsBoolean, IsNumber, IsOptional, IsUUID, Min, ValidateIf, ValidateNested } from "class-validator";

class MarkEntryDto {
  @IsUUID()
  enrollmentId!: string;

  // An absent student has no mark at all — never a 0. Exactly one of
  // marksObtained / isAbsent is meaningful per entry (the service rejects
  // sending both).
  @IsOptional()
  @IsBoolean()
  isAbsent?: boolean;

  @ValidateIf((o: MarkEntryDto) => !o.isAbsent)
  // Result.marksObtained is Decimal(6,2): more than two decimals would be
  // silently rounded by the database, so it is refused up front instead.
  @IsNumber({ maxDecimalPlaces: 2 }, { message: "Each mark must be a number with at most 2 decimal places" })
  @Min(0, { message: "A mark can't be negative" })
  marksObtained?: number;
}

export class EnterMarksDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MarkEntryDto)
  entries!: MarkEntryDto[];
}
