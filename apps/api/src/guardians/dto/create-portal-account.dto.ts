import { IsEmail, IsOptional } from "class-validator";

export class CreatePortalAccountDto {
  // Required only if the guardian has no email on file yet.
  @IsOptional()
  @IsEmail()
  email?: string;
}
