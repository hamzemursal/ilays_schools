import { ArrayMinSize, IsArray, IsOptional, IsUUID } from "class-validator";

export class BulkTransferClassDto {
  @IsUUID()
  academicYearId!: string;

  // Omit to move every section of the source class. Required (and must
  // differ from toSectionId) when transferring within the same class, so a
  // same-class move always names one real source section rather than an
  // ambiguous "everyone into one of their own sections."
  @IsOptional()
  @IsUUID()
  fromSectionId?: string;

  // Cherry-picked students (found by name/ID/roll number in the UI) instead
  // of an entire section — can move to any class, same as fromSectionId.
  // Mutually exclusive with fromSectionId.
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID(undefined, { each: true })
  enrollmentIds?: string[];

  @IsUUID()
  toClassId!: string;

  @IsUUID()
  toSectionId!: string;
}
