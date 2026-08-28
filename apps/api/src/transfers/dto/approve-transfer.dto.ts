import { IsInt, IsOptional, IsString, IsUUID, Min } from "class-validator";

export class ApproveTransferDto {
  @IsUUID()
  academicYearId!: string;

  @IsUUID()
  classId!: string;

  @IsUUID()
  sectionId!: string;

  // Per the destination school's own numbering policy, by default.
  @IsOptional()
  @IsString()
  studentNumber?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  rollNumber?: number;
}
