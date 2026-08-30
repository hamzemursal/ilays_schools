import { IsInt, IsOptional, IsString, Max, Min, MinLength } from "class-validator";

export class UpdateSectionDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  // Send null to make the section unlimited again.
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(500)
  capacity?: number | null;
}
