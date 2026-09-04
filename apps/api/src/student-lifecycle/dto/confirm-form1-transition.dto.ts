import { Type } from "class-transformer";
import { ArrayMinSize, IsArray, IsUUID, ValidateNested } from "class-validator";

// One entry per student being transitioned — deliberately per-enrollment,
// not one shared sectionId for the whole batch, so different students can
// land in different Form 1 sections in a single confirm (see
// StudentLifecycleService.confirmForm1Transition).
class Form1SectionAssignmentDto {
  @IsUUID()
  enrollmentId!: string;

  @IsUUID()
  sectionId!: string;
}

export class ConfirmForm1TransitionDto {
  @IsUUID()
  toClassId!: string;

  @IsUUID()
  toAcademicYearId!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => Form1SectionAssignmentDto)
  assignments!: Form1SectionAssignmentDto[];
}
