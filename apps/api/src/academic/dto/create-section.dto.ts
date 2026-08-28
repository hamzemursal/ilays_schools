import { IsInt, IsString, Max, Min, MinLength } from "class-validator";

export class CreateSectionDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsInt()
  @Min(1)
  @Max(500)
  capacity!: number;
}
