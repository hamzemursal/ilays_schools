import { IsUUID } from "class-validator";

export class BulkTransferClassDto {
  @IsUUID()
  academicYearId!: string;

  @IsUUID()
  toClassId!: string;

  @IsUUID()
  toSectionId!: string;
}
