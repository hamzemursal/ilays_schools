import { IsInt, IsOptional, IsString, IsUUID, Min } from "class-validator";

export class EnrollmentInputDto {
  @IsUUID()
  academicYearId!: string;

  @IsUUID()
  classId!: string;

  @IsUUID()
  sectionId!: string;

  // Omit to auto-generate per the school's sequential numbering policy.
  @IsOptional()
  @IsString()
  studentNumber?: string;

  // Omit to auto-assign the next available roll number in the section.
  @IsOptional()
  @IsInt()
  @Min(1)
  rollNumber?: number;
}
