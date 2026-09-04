import { BadRequestException, Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import { AttendanceService } from "./attendance.service";
import { MarkAttendanceDto } from "./dto/mark-attendance.dto";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { RequirePermissions } from "../auth/decorators/require-permissions.decorator";
import type { AuthenticatedUser } from "../auth/types/authenticated-user";

@Controller()
export class AttendanceController {
  constructor(private readonly attendance: AttendanceService) {}

  @RequirePermissions("attendance.view")
  @Get("schools/:schoolId/sections/:sectionId/attendance")
  get(
    @CurrentUser() user: AuthenticatedUser,
    @Param("schoolId") schoolId: string,
    @Param("sectionId") sectionId: string,
    @Query("date") date?: string,
  ) {
    if (!date) throw new BadRequestException("date query param is required");
    return this.attendance.getForSectionAndDate(user, schoolId, sectionId, date);
  }

  @RequirePermissions("attendance.mark")
  @Post("schools/:schoolId/sections/:sectionId/attendance")
  mark(
    @CurrentUser() user: AuthenticatedUser,
    @Param("schoolId") schoolId: string,
    @Param("sectionId") sectionId: string,
    @Body() dto: MarkAttendanceDto,
  ) {
    return this.attendance.mark(user, schoolId, sectionId, dto);
  }

  @RequirePermissions("attendance.mark")
  @Post("schools/:schoolId/sections/:sectionId/attendance/draft")
  saveDraft(
    @CurrentUser() user: AuthenticatedUser,
    @Param("schoolId") schoolId: string,
    @Param("sectionId") sectionId: string,
    @Body() dto: MarkAttendanceDto,
  ) {
    return this.attendance.saveDraft(user, schoolId, sectionId, dto);
  }

  // Same admin-only reports.view gate as the enrollment report this page's
  // Attendance overview already loads alongside this call — see
  // AttendanceService.getStatusForDate for why this isn't attendance.view.
  @RequirePermissions("reports.view")
  @Get("schools/:schoolId/attendance/status")
  status(@CurrentUser() user: AuthenticatedUser, @Param("schoolId") schoolId: string, @Query("date") date?: string) {
    if (!date) throw new BadRequestException("date query param is required");
    return this.attendance.getStatusForDate(user, schoolId, date);
  }

  @RequirePermissions("attendance.view")
  @Get("schools/:schoolId/sections/:sectionId/attendance/history")
  history(
    @CurrentUser() user: AuthenticatedUser,
    @Param("schoolId") schoolId: string,
    @Param("sectionId") sectionId: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
  ) {
    return this.attendance.historyForSection(user, schoolId, sectionId, from, to);
  }

  @RequirePermissions("attendance.view")
  @Get("schools/:schoolId/sections/:sectionId/attendance/summary")
  summary(
    @CurrentUser() user: AuthenticatedUser,
    @Param("schoolId") schoolId: string,
    @Param("sectionId") sectionId: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
  ) {
    return this.attendance.summaryForSection(user, schoolId, sectionId, from, to);
  }

  @RequirePermissions("attendance.view")
  @Get("students/:id/attendance")
  historyForStudent(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return this.attendance.historyForStudent(user, id);
  }
}
