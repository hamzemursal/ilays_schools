import { IsString, MinLength } from "class-validator";

// A reason is always required — same rationale as ReturnForCorrectionDto:
// unpublishing removes results the Student/Parent Portals were already
// showing, so the audit trail (and the teacher's notification) must record
// why, not just who and when.
export class UnpublishResultsDto {
  @IsString()
  @MinLength(1)
  reason!: string;
}
