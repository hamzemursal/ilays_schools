import { Controller, Get, Param, Query, Res } from "@nestjs/common";
import type { Response } from "express";
import { ExportsService } from "./exports.service";
import {
  ATTENDANCE_SESSIONS,
  ATTENDANCE_STATUSES,
  FEE_STATUSES,
  GENDERS,
  GUARDIAN_RELATIONSHIPS,
  STUDENT_STATUSES,
  parseBool,
  parseEnum,
} from "../students/student-directory-query.util";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { RequirePermissions } from "../auth/decorators/require-permissions.decorator";
import type { AuthenticatedUser } from "../auth/types/authenticated-user";

@Controller("schools/:schoolId/exports")
export class ExportsController {
  constructor(private readonly exports: ExportsService) {}

  @RequirePermissions("exports.create")
  @Get("students")
  async students(
    @CurrentUser() user: AuthenticatedUser,
    @Param("schoolId") schoolId: string,
    @Res() res: Response,
  ) {
    const csv = await this.exports.exportStudents(user, schoolId);
    this.send(res, csv, "students.csv");
  }

  // The Advanced Student List's export — same filters as
  // GET .../students/directory, plus which columns to include (defaults to
  // the list's own default set when omitted) and, for "Export Selected
  // Students", an explicit enrollment-id allowlist layered on top of the
  // filtered result.
  @RequirePermissions("exports.create")
  @Get("students/directory")
  async studentsDirectory(
    @CurrentUser() user: AuthenticatedUser,
    @Param("schoolId") schoolId: string,
    @Query("academicYearId") academicYearId: string,
    @Query("classId") classId?: string,
    @Query("sectionId") sectionId?: string,
    @Query("search") search?: string,
    @Query("gender") gender?: string,
    @Query("studentStatus") studentStatus?: string,
    @Query("hasParent") hasParent?: string,
    @Query("guardianName") guardianName?: string,
    @Query("guardianRelationship") guardianRelationship?: string,
    @Query("hasGuardianContact") hasGuardianContact?: string,
    @Query("feeStatus") feeStatus?: string,
    @Query("hasOutstandingBalance") hasOutstandingBalance?: string,
    @Query("attendanceDate") attendanceDate?: string,
    @Query("attendanceSession") attendanceSession?: string,
    @Query("attendanceStatus") attendanceStatus?: string,
    @Query("columns") columns?: string,
    @Query("ids") ids?: string,
    @Res() res?: Response,
  ) {
    const csv = await this.exports.exportStudentDirectory(
      user,
      schoolId,
      {
        academicYearId,
        classId,
        sectionId,
        search,
        gender: parseEnum(gender, GENDERS, "gender"),
        studentStatus: parseEnum(studentStatus, STUDENT_STATUSES, "studentStatus"),
        hasParent: parseBool(hasParent),
        guardianName,
        guardianRelationship: parseEnum(guardianRelationship, GUARDIAN_RELATIONSHIPS, "guardianRelationship"),
        hasGuardianContact: parseBool(hasGuardianContact),
        feeStatus: parseEnum(feeStatus, FEE_STATUSES, "feeStatus"),
        hasOutstandingBalance: parseBool(hasOutstandingBalance),
        attendanceDate,
        attendanceSession: parseEnum(attendanceSession, ATTENDANCE_SESSIONS, "attendanceSession"),
        attendanceStatus: parseEnum(attendanceStatus, ATTENDANCE_STATUSES, "attendanceStatus"),
      },
      columns ? columns.split(",").filter(Boolean) : undefined,
      ids ? ids.split(",").filter(Boolean) : undefined,
    );
    this.send(res!, csv, "students.csv");
  }

  @RequirePermissions("exports.create")
  @Get("teachers")
  async teachers(
    @CurrentUser() user: AuthenticatedUser,
    @Param("schoolId") schoolId: string,
    @Res() res: Response,
  ) {
    const csv = await this.exports.exportTeachers(user, schoolId);
    this.send(res, csv, "teachers.csv");
  }

  @RequirePermissions("exports.create")
  @Get("invoices")
  async invoices(
    @CurrentUser() user: AuthenticatedUser,
    @Param("schoolId") schoolId: string,
    @Res() res: Response,
  ) {
    const csv = await this.exports.exportInvoices(user, schoolId);
    this.send(res, csv, "invoices.csv");
  }

  private send(res: Response, csv: string, filename: string) {
    res.set({
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    });
    res.send(csv);
  }
}
