import { Type } from "class-transformer";
import { IsArray, IsEmail, IsOptional, IsString, MinLength, ValidateNested } from "class-validator";
import { CreateTeacherAssignmentInputDto } from "./create-teacher-assignment-input.dto";

export class CreateTeacherDto {
  @IsString()
  @MinLength(1)
  firstName!: string;

  @IsString()
  @MinLength(1)
  lastName!: string;

  @IsString()
  @MinLength(1)
  employeeNumber!: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  qualification?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateTeacherAssignmentInputDto)
  assignments?: CreateTeacherAssignmentInputDto[];
}
