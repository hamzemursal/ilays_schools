import { IsInt, Max, Min } from "class-validator";

export class UpdateTermWeightsDto {
  @IsInt()
  @Min(0)
  @Max(100)
  term1Weight!: number;

  @IsInt()
  @Min(0)
  @Max(100)
  term2Weight!: number;
}
