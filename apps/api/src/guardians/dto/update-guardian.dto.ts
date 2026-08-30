import { IsEmail, IsEnum, IsOptional, IsString, MinLength } from "class-validator";
import { GuardianStatus } from "@school-erp/database";

export class UpdateGuardianDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  firstName?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  lastName?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  address?: string;

  // Setting ARCHIVED also suspends the linked portal account, if any — see
  // GuardiansService.update. Never auto-restored on the way back to ACTIVE.
  @IsOptional()
  @IsEnum(GuardianStatus)
  status?: GuardianStatus;
}
