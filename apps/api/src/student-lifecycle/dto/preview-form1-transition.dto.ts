import { ArrayUnique, IsArray, IsOptional, IsUUID } from "class-validator";

export class PreviewForm1TransitionDto {
  // Must be a level-1 class in the destination school's SECONDARY division —
  // validated in the service, not here, since that check needs a database lookup.
  @IsUUID()
  toClassId!: string;

  @IsUUID()
  toAcademicYearId!: string;

  // Optional: another school of the same organization whose Form 1 the
  // students continue into. Omitted means the source school itself.
  @IsOptional()
  @IsUUID()
  toSchoolId?: string;

  // May be empty: the destination's section capacity (targetSections) can be
  // previewed before any student has completed Class 8 yet.
  @IsArray()
  @ArrayUnique()
  @IsUUID(undefined, { each: true })
  enrollmentIds!: string[];
}
