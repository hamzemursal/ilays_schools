import { IsOptional, IsString } from "class-validator";

export class CreateStaffAssignmentInputDto {
  @IsOptional()
  @IsString()
  departmentId?: string;

  @IsOptional()
  @IsString()
  role?: string;
}
