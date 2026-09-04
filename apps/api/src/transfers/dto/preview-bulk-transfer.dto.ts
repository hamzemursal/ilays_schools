import { ArrayMinSize, ArrayUnique, IsArray, IsUUID } from "class-validator";

export class PreviewBulkTransferDto {
  @IsUUID()
  toSchoolId!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @IsUUID(undefined, { each: true })
  studentIds!: string[];
}
