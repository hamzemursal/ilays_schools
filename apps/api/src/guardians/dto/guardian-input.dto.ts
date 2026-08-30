import { IsBoolean, IsEmail, IsEnum, IsOptional, IsString, IsUUID, MinLength } from "class-validator";
import { GuardianRelationship } from "@school-erp/database";

// Used both when adding a guardian to an existing student and when supplying
// guardians as part of student creation. When existingGuardianId is set (the
// admin picked a guardian from search), that id is used directly — see
// GuardiansService.resolveGuardian. Otherwise a guardian is resolved by exact
// phone/email match, then created if neither matches (findOrCreate).
export class GuardianInputDto {
  @IsOptional()
  @IsUUID()
  existingGuardianId?: string;

  @IsString()
  @MinLength(1)
  firstName!: string;

  @IsString()
  @MinLength(1)
  lastName!: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsEnum(GuardianRelationship)
  relationship!: GuardianRelationship;

  @IsOptional()
  @IsBoolean()
  isPrimaryContact?: boolean;
}
