import { Type } from "class-transformer";
import { IsArray, IsInt, IsOptional, IsString, IsUUID, Min, MinLength, ValidateNested } from "class-validator";

export class CreateClassSectionInputDto {
  @IsString()
  @MinLength(1)
  name!: string;

  // Omit for unlimited capacity — see Section.capacity.
  @IsOptional()
  @IsInt()
  @Min(1)
  capacity?: number | null;
}

export class CreateClassDto {
  @IsUUID()
  divisionId!: string;

  // The academic year this class belongs to. Required: "Form 3" of 2026-2027
  // and "Form 3" of 2025-2026 are different classes.
  @IsUUID()
  academicYearId!: string;

  @IsString()
  @MinLength(1)
  name!: string;

  @IsInt()
  @Min(1)
  level!: number;

  // Optional so the existing "just create a bare class" callers keep
  // working unchanged — the one-workflow Create Class wizard is what
  // actually populates these, creating class + sections + subject links
  // in a single transaction (see ClassesService.create).
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateClassSectionInputDto)
  sections?: CreateClassSectionInputDto[];

  @IsOptional()
  @IsArray()
  @IsUUID(undefined, { each: true })
  subjectIds?: string[];
}
