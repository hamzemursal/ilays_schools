import { IsInt, Max, Min } from "class-validator";

export class UpdateSectionDto {
  @IsInt()
  @Min(1)
  @Max(500)
  capacity!: number;
}
