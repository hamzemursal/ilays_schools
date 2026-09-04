import { Type } from "class-transformer";
import { ArrayMinSize, IsArray, IsOptional, IsString, IsUUID, ValidateNested } from "class-validator";

// One entry per student — deliberately per-student, not one shared
// sectionId for the whole batch, so different students can land in
// different sections of the same destination class in a single confirm
// (see TransfersService.confirmBulkTransfer).
class BulkTransferAssignmentDto {
  @IsUUID()
  studentId!: string;

  @IsUUID()
  sectionId!: string;
}

export class ConfirmBulkTransferDto {
  @IsUUID()
  toSchoolId!: string;

  @IsUUID()
  toAcademicYearId!: string;

  @IsUUID()
  toClassId!: string;

  @IsOptional()
  @IsString()
  reason?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => BulkTransferAssignmentDto)
  assignments!: BulkTransferAssignmentDto[];
}
