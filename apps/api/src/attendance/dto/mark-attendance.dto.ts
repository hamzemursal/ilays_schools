import { Type } from "class-transformer";
import { IsArray, IsDateString, IsEnum, IsOptional, IsString, IsUUID, ValidateNested } from "class-validator";
import { AttendanceStatus } from "@school-erp/database";

class AttendanceEntryDto {
  @IsUUID()
  enrollmentId!: string;

  @IsEnum(AttendanceStatus)
  status!: AttendanceStatus;

  @IsOptional()
  @IsString()
  note?: string;
}

export class MarkAttendanceDto {
  @IsDateString()
  date!: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AttendanceEntryDto)
  entries!: AttendanceEntryDto[];
}
