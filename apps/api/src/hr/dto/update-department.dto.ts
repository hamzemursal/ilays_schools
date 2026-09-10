import { IsEnum, IsOptional, IsString, MinLength } from "class-validator";
import { DepartmentStatus } from "@school-erp/database";

export class UpdateDepartmentDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsEnum(DepartmentStatus)
  status?: DepartmentStatus;
}
