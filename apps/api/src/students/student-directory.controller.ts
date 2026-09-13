import { BadRequestException, Controller, Get, Param, Query } from "@nestjs/common";
import type { AttendanceSession, AttendanceStatus, Sex, StudentStatus } from "@school-erp/database";
import { StudentDirectoryService } from "./student-directory.service";
import type { FeeStatus } from "../finance/student-ledger.service";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { RequirePermissions } from "../auth/decorators/require-permissions.decorator";
import type { AuthenticatedUser } from "../auth/types/authenticated-user";

const GENDERS: Sex[] = ["MALE", "FEMALE"];
const STUDENT_STATUSES: StudentStatus[] = ["ACTIVE", "COMPLETED", "GRADUATED", "TRANSFERRED", "WITHDRAWN", "ARCHIVED"];
const FEE_STATUSES: FeeStatus[] = ["PAID", "PARTIALLY_PAID", "PENDING", "OVERDUE", "NO_CHARGE"];
const ATTENDANCE_SESSIONS: AttendanceSession[] = ["MORNING", "AFTERNOON"];
const ATTENDANCE_STATUSES: (AttendanceStatus | "NOT_RECORDED")[] = ["PRESENT", "ABSENT", "LATE", "EXCUSED", "NOT_RECORDED"];

function parseBool(value: string | undefined): boolean | undefined {
  if (value === undefined) return undefined;
  if (value === "true") return true;
  if (value === "false") return false;
  throw new BadRequestException("Expected 'true' or 'false'");
}

function parseEnum<T extends string>(value: string | undefined, allowed: T[], paramName: string): T | undefined {
  if (value === undefined) return undefined;
  if (!allowed.includes(value as T)) throw new BadRequestException(`${paramName} must be one of: ${allowed.join(", ")}`);
  return value as T;
}

// Kept as its own controller/route (schools/:schoolId/students/directory)
// rather than changing GET schools/:schoolId/students — that endpoint is
// used by callers (Transfers wizard, Reports, the Parent portal's children
// list) that expect its existing plain-array response, unpaginated. This is
// additive, not a replacement.
@Controller("schools/:schoolId/students")
export class StudentDirectoryController {
  constructor(private readonly directory: StudentDirectoryService) {}

  @RequirePermissions("students.view")
  @Get("directory")
  search(
    @CurrentUser() user: AuthenticatedUser,
    @Param("schoolId") schoolId: string,
    @Query("academicYearId") academicYearId: string,
    @Query("classId") classId?: string,
    @Query("sectionId") sectionId?: string,
    @Query("search") search?: string,
    @Query("gender") gender?: string,
    @Query("studentStatus") studentStatus?: string,
    @Query("hasParent") hasParent?: string,
    @Query("feeStatus") feeStatus?: string,
    @Query("hasOutstandingBalance") hasOutstandingBalance?: string,
    @Query("attendanceDate") attendanceDate?: string,
    @Query("attendanceSession") attendanceSession?: string,
    @Query("attendanceStatus") attendanceStatus?: string,
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string,
  ) {
    return this.directory.search(user, schoolId, {
      academicYearId,
      classId,
      sectionId,
      search,
      gender: parseEnum(gender, GENDERS, "gender"),
      studentStatus: parseEnum(studentStatus, STUDENT_STATUSES, "studentStatus"),
      hasParent: parseBool(hasParent),
      feeStatus: parseEnum(feeStatus, FEE_STATUSES, "feeStatus"),
      hasOutstandingBalance: parseBool(hasOutstandingBalance),
      attendanceDate,
      attendanceSession: parseEnum(attendanceSession, ATTENDANCE_SESSIONS, "attendanceSession"),
      attendanceStatus: parseEnum(attendanceStatus, ATTENDANCE_STATUSES, "attendanceStatus"),
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
    });
  }
}
