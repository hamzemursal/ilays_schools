import { IsEmail, IsEnum, IsOptional, IsString, MinLength } from "class-validator";
import { SchoolType } from "@school-erp/database";

export class CreateSchoolDto {
  @IsString()
  @MinLength(2)
  name!: string;

  @IsEnum(SchoolType)
  type!: SchoolType;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsEmail()
  email?: string;
}
