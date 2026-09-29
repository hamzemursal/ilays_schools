import { ArrayMaxSize, IsArray, IsEnum, IsOptional, IsString, IsUUID, MinLength } from "class-validator";
import { AnnouncementAudience } from "@school-erp/database";

export class AnnouncementTargetDto {
  @IsOptional()
  @IsEnum(AnnouncementAudience)
  audience?: AnnouncementAudience;

  // Scope (current audiences only): year + class, optionally + section.
  // Checked against the school in AnnouncementAudienceService.validate.
  @IsOptional()
  @IsUUID()
  academicYearId?: string;

  @IsOptional()
  @IsUUID()
  classId?: string;

  @IsOptional()
  @IsUUID()
  sectionId?: string;

  // Specific People only — users of this school.
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(500)
  @IsUUID("all", { each: true })
  recipientUserIds?: string[];
}

export class CreateAnnouncementDto extends AnnouncementTargetDto {
  @IsString()
  @MinLength(1)
  title!: string;

  @IsString()
  @MinLength(1)
  body!: string;
}
