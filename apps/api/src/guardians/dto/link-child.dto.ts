import { IsBoolean, IsEnum, IsOptional, IsUUID } from "class-validator";
import { GuardianRelationship } from "@school-erp/database";

export class LinkChildDto {
  @IsUUID()
  studentId!: string;

  @IsEnum(GuardianRelationship)
  relationship!: GuardianRelationship;

  @IsOptional()
  @IsBoolean()
  isPrimaryContact?: boolean;
}
