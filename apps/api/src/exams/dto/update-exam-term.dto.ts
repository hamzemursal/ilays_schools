import { IsUUID } from "class-validator";

// The only field of an Exam that can change after creation, and only ever
// to another of that same academic year's two terms — never to "no term".
export class UpdateExamTermDto {
  @IsUUID()
  termId!: string;
}
