import { IsNumber, IsOptional, IsPositive, IsString, IsUUID, MinLength } from "class-validator";

export class CreateFeeStructureDto {
  @IsUUID()
  academicYearId!: string;

  // Omit to apply school-wide, across every class.
  @IsOptional()
  @IsUUID()
  classId?: string;

  @IsString()
  @MinLength(1)
  name!: string;

  @IsNumber()
  @IsPositive()
  amount!: number;
}
