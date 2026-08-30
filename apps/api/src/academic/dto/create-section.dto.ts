import { IsInt, IsOptional, IsString, Max, Min, MinLength } from "class-validator";

export class CreateSectionDto {
  @IsString()
  @MinLength(1)
  name!: string;

  // Omit (or send null) for unlimited capacity — the default for new
  // sections. A number preserves the original fixed-capacity behavior.
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(500)
  capacity?: number | null;
}
