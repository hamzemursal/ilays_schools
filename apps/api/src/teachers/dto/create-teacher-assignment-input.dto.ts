import { IsUUID } from "class-validator";

export class CreateTeacherAssignmentInputDto {
  @IsUUID()
  academicYearId!: string;

  @IsUUID()
  sectionId!: string;

  @IsUUID()
  subjectId!: string;
}
