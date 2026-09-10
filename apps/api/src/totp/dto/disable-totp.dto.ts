import { IsString } from "class-validator";

export class DisableTotpDto {
  @IsString()
  password!: string;
}
