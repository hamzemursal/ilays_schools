import { IsString, MinLength } from "class-validator";

export class LoginDto {
  // Every non-student account logs in with a real email, unchanged. A
  // Student Portal account has no real inbox, so this same field also
  // accepts its Student Login ID (e.g. "STU-2027-00003") — see
  // AuthService.resolveLoginUser for how the two are told apart.
  @IsString()
  @MinLength(1)
  email!: string;

  @IsString()
  @MinLength(1)
  password!: string;
}
