import { Type } from "class-transformer";
import { ArrayMinSize, IsArray, IsEnum, IsOptional, IsUUID, ValidateNested } from "class-validator";
import { PromotionOutcome } from "@school-erp/database";

class PromotionAssignmentDto {
  @IsUUID()
  enrollmentId!: string;

  @IsEnum(PromotionOutcome)
  outcome!: PromotionOutcome;

  // Required for PROMOTED (a section in the next class) and RETAINED (a
  // section in the SAME class — may differ from the student's current
  // section) — never used for COMPLETED/GRADUATED, which create no new
  // enrollment at all.
  @IsOptional()
  @IsUUID()
  targetSectionId?: string;
}

export class PromoteSectionDto {
  // Which year's cohort in this section to promote — a Section is a
  // reusable structural container across years, so this is never inferred.
  @IsUUID()
  fromAcademicYearId!: string;

  @IsUUID()
  toAcademicYearId!: string;

  // One entry per student the Admin is confirming an outcome for — not
  // necessarily every active enrollment in the section; a student the
  // Admin isn't ready to decide on (e.g. genuinely Incomplete) can simply
  // be left out of this array and confirmed in a later batch.
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PromotionAssignmentDto)
  assignments!: PromotionAssignmentDto[];
}
