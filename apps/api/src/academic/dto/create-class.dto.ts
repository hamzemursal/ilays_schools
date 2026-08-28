import { IsInt, IsString, IsUUID, Min, MinLength } from "class-validator";

export class CreateClassDto {
  @IsUUID()
  divisionId!: string;

  @IsString()
  @MinLength(1)
  name!: string;

  @IsInt()
  @Min(1)
  level!: number;
}
