import { IsOptional, IsUUID } from "class-validator";

export class PromoteSectionDto {
  // Which year's cohort in this section to promote — a Section is a
  // reusable structural container across years, so this is never inferred.
  @IsUUID()
  fromAcademicYearId!: string;

  @IsUUID()
  toAcademicYearId!: string;

  // Required when the preview outcome is PROMOTE (ignored for
  // COMPLETE/GRADUATE, since there's no next section to enroll into).
  @IsOptional()
  @IsUUID()
  targetSectionId?: string;
}
