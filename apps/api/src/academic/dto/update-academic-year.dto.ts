import { IsBoolean, IsOptional } from "class-validator";

export class UpdateAcademicYearDto {
  @IsOptional()
  @IsBoolean()
  isCurrent?: boolean;
}
