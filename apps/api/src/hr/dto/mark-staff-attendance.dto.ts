import { IsDateString, IsEnum, IsOptional, IsString } from "class-validator";
import { StaffAttendanceStatus } from "@school-erp/database";

// Exactly one of teacherId/staffId must be provided — enforced in
// StaffAttendanceService, same convention as CreateLeaveRequestDto.
export class MarkStaffAttendanceDto {
  @IsOptional()
  @IsString()
  teacherId?: string;

  @IsOptional()
  @IsString()
  staffId?: string;

  @IsDateString()
  date!: string;

  @IsEnum(StaffAttendanceStatus)
  status!: StaffAttendanceStatus;

  @IsOptional()
  @IsString()
  note?: string;
}
