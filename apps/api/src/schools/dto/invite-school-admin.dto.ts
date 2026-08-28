import { IsEmail } from "class-validator";

export class InviteSchoolAdminDto {
  @IsEmail()
  email!: string;
}
