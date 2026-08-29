import { IsEmail, IsOptional, IsString } from "class-validator";

// A teacher editing their own profile (see MyTeachingController) may only
// touch personal/contact fields — never their code, school, employment
// info, status, or assignments. Those stay School Admin controlled via
// UpdateTeacherDto.
export class UpdateMyTeacherProfileDto {
  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  emergencyContactName?: string;

  @IsOptional()
  @IsString()
  emergencyContactPhone?: string;
}
