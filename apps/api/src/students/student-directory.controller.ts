import { Controller, Get, Param, Query } from "@nestjs/common";
import { StudentDirectoryService } from "./student-directory.service";
import {
  ATTENDANCE_SESSIONS,
  ATTENDANCE_STATUSES,
  FEE_STATUSES,
  GENDERS,
  STUDENT_STATUSES,
  parseBool,
  parseEnum,
} from "./student-directory-query.util";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { RequirePermissions } from "../auth/decorators/require-permissions.decorator";
import type { AuthenticatedUser } from "../auth/types/authenticated-user";

// Kept as its own controller/route (schools/:schoolId/students/directory)
// rather than changing GET schools/:schoolId/students — that endpoint is
// used by callers (Transfers wizard, Reports, the Parent portal's children
// list) that expect its existing plain-array response, unpaginated. This is
// additive, not a replacement.
interface RawFilterQuery {
  academicYearId: string;
  classId?: string;
  sectionId?: string;
  search?: string;
  gender?: string;
  studentStatus?: string;
  hasParent?: string;
  feeStatus?: string;
  hasOutstandingBalance?: string;
  attendanceDate?: string;
  attendanceSession?: string;
  attendanceStatus?: string;
}

// Shared by both routes below (and mirrored by ExportsController) so the
// same query string always means the same filter, everywhere it's accepted.
function parseFilters(q: RawFilterQuery) {
  return {
    academicYearId: q.academicYearId,
    classId: q.classId,
    sectionId: q.sectionId,
    search: q.search,
    gender: parseEnum(q.gender, GENDERS, "gender"),
    studentStatus: parseEnum(q.studentStatus, STUDENT_STATUSES, "studentStatus"),
    hasParent: parseBool(q.hasParent),
    feeStatus: parseEnum(q.feeStatus, FEE_STATUSES, "feeStatus"),
    hasOutstandingBalance: parseBool(q.hasOutstandingBalance),
    attendanceDate: q.attendanceDate,
    attendanceSession: parseEnum(q.attendanceSession, ATTENDANCE_SESSIONS, "attendanceSession"),
    attendanceStatus: parseEnum(q.attendanceStatus, ATTENDANCE_STATUSES, "attendanceStatus"),
  };
}

@Controller("schools/:schoolId/students")
export class StudentDirectoryController {
  constructor(private readonly directory: StudentDirectoryService) {}

  @RequirePermissions("students.view")
  @Get("directory")
  search(
    @CurrentUser() user: AuthenticatedUser,
    @Param("schoolId") schoolId: string,
    @Query() query: RawFilterQuery & { page?: string; pageSize?: string },
  ) {
    return this.directory.search(user, schoolId, {
      ...parseFilters(query),
      page: query.page ? Number(query.page) : undefined,
      pageSize: query.pageSize ? Number(query.pageSize) : undefined,
    });
  }

  // Backs the Advanced Student List's summary cards (Total/Active/Present
  // Today/Outstanding) — computed over the whole current filtered set, not
  // just one page, so these numbers are never misleading relative to what
  // "Total Students" actually says.
  @RequirePermissions("students.view")
  @Get("directory/summary")
  summary(@CurrentUser() user: AuthenticatedUser, @Param("schoolId") schoolId: string, @Query() query: RawFilterQuery) {
    return this.directory.summary(user, schoolId, parseFilters(query));
  }
}
