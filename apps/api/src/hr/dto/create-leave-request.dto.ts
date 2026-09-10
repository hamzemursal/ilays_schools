import { IsDateString, IsEnum, IsOptional, IsString } from "class-validator";
import { LeaveType } from "@school-erp/database";

// Exactly one of teacherId/staffId must be provided — enforced in
// LeaveRequestsService, not here, since it depends on which one resolves to
// a real record in this school.
export class CreateLeaveRequestDto {
  @IsOptional()
  @IsString()
  teacherId?: string;

  @IsOptional()
  @IsString()
  staffId?: string;

  @IsEnum(LeaveType)
  type!: LeaveType;

  @IsDateString()
  startDate!: string;

  @IsDateString()
  endDate!: string;

  @IsOptional()
  @IsString()
  reason?: string;
}
