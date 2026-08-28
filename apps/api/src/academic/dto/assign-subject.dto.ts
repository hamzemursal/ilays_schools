import { IsUUID } from "class-validator";

export class AssignSubjectDto {
  @IsUUID()
  subjectId!: string;
}
