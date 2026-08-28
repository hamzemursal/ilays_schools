import { Type } from "class-transformer";
import { IsArray, IsNumber, IsUUID, Min, ValidateNested } from "class-validator";

class MarkEntryDto {
  @IsUUID()
  enrollmentId!: string;

  @IsNumber()
  @Min(0)
  marksObtained!: number;
}

export class EnterMarksDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MarkEntryDto)
  entries!: MarkEntryDto[];
}
