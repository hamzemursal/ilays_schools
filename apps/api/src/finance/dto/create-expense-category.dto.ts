import { IsString, MinLength } from "class-validator";

export class CreateExpenseCategoryDto {
  @IsString()
  @MinLength(1)
  name!: string;
}
