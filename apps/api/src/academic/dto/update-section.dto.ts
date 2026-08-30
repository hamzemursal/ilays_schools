import { IsInt, IsOptional, Max, Min } from "class-validator";

export class UpdateSectionDto {
  // Send null to make the section unlimited again.
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(500)
  capacity?: number | null;
}
