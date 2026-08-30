import { IsInt, IsOptional, IsString, IsUUID, Min, MinLength } from "class-validator";

export class UpdateClassDto {
  @IsOptional()
  @IsUUID()
  divisionId?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  level?: number;
}
