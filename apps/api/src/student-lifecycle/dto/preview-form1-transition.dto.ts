import { ArrayMinSize, ArrayUnique, IsArray, IsUUID } from "class-validator";

export class PreviewForm1TransitionDto {
  // Must be a level-1 class in this school's SECONDARY division — validated
  // in the service, not here, since that check needs a database lookup.
  @IsUUID()
  toClassId!: string;

  @IsUUID()
  toAcademicYearId!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @IsUUID(undefined, { each: true })
  enrollmentIds!: string[];
}
