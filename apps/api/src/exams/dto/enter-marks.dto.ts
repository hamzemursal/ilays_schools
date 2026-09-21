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
  @IsNumber()
  @Min(0)
  marksObtained?: number;
}

export class EnterMarksDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MarkEntryDto)
  entries!: MarkEntryDto[];
}
