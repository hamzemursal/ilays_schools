import { IsOptional, IsString, IsUUID } from "class-validator";

export class RequestTransferDto {
  @IsUUID()
  toSchoolId!: string;

  @IsOptional()
  @IsString()
  reason?: string;
}
