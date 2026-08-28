import { IsEmail, IsOptional } from "class-validator";

export class InviteTeacherLoginDto {
  // Optional — falls back to the teacher's own recorded email if omitted.
  @IsOptional()
  @IsEmail()
  email?: string;
}
