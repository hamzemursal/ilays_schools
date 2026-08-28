import { IsBoolean, IsEmail, IsEnum, IsOptional, IsString, MinLength } from "class-validator";
import { GuardianRelationship } from "@school-erp/database";

// Used both when adding a guardian to an existing student and when supplying
// guardians as part of student creation. Matching is by phone (then email) —
// see GuardiansService.findOrCreate — so an existing guardian is reused
// rather than duplicated when either identifier matches.
export class GuardianInputDto {
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
