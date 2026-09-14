import { BadRequestException } from "@nestjs/common";
import type { AttendanceSession, AttendanceStatus, GuardianRelationship, Sex, StudentStatus } from "@school-erp/database";
import type { FeeStatus } from "../finance/student-ledger.service";

// Shared between StudentDirectoryController (the list) and ExportsController
// (the matching export) so both parse and validate the same query params the
// same way — never two slightly-different definitions of what's allowed.
export const GENDERS: Sex[] = ["MALE", "FEMALE"];
export const STUDENT_STATUSES: StudentStatus[] = ["ACTIVE", "COMPLETED", "GRADUATED", "TRANSFERRED", "WITHDRAWN", "ARCHIVED"];
export const FEE_STATUSES: FeeStatus[] = ["PAID", "PARTIALLY_PAID", "PENDING", "OVERDUE", "NO_CHARGE"];
export const ATTENDANCE_SESSIONS: AttendanceSession[] = ["MORNING", "AFTERNOON"];
export const ATTENDANCE_STATUSES: (AttendanceStatus | "NOT_RECORDED")[] = ["PRESENT", "ABSENT", "LATE", "EXCUSED", "NOT_RECORDED"];
export const GUARDIAN_RELATIONSHIPS: GuardianRelationship[] = ["FATHER", "MOTHER", "GUARDIAN", "OTHER"];

export function parseBool(value: string | undefined): boolean | undefined {
  if (value === undefined) return undefined;
  if (value === "true") return true;
  if (value === "false") return false;
  throw new BadRequestException("Expected 'true' or 'false'");
}

export function parseEnum<T extends string>(value: string | undefined, allowed: T[], paramName: string): T | undefined {
  if (value === undefined) return undefined;
  if (!allowed.includes(value as T)) throw new BadRequestException(`${paramName} must be one of: ${allowed.join(", ")}`);
  return value as T;
}
