import { IsEnum, IsOptional, IsString, MinLength } from "class-validator";
import { AnnouncementAudience } from "@school-erp/database";

export class CreateAnnouncementDto {
  @IsString()
  @MinLength(1)
  title!: string;

  @IsString()
  @MinLength(1)
  body!: string;

  @IsOptional()
  @IsEnum(AnnouncementAudience)
  audience?: AnnouncementAudience;
}
