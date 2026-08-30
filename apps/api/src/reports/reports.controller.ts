import { BadRequestException, Controller, Get, Param, Query } from "@nestjs/common";
import { ReportsService } from "./reports.service";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { RequirePermissions } from "../auth/decorators/require-permissions.decorator";
import type { AuthenticatedUser } from "../auth/types/authenticated-user";

@Controller("schools/:schoolId/reports")
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @RequirePermissions("reports.view")
  @Get("enrollment")
  enrollment(
    @CurrentUser() user: AuthenticatedUser,
    @Param("schoolId") schoolId: string,
    @Query("academicYearId") academicYearId?: string,
  ) {
    if (!academicYearId) throw new BadRequestException("academicYearId query param is required");
    return this.reports.enrollmentByClass(user, schoolId, academicYearId);
  }

  @RequirePermissions("reports.view")
  @Get("attendance")
  attendance(
    @CurrentUser() user: AuthenticatedUser,
    @Param("schoolId") schoolId: string,
    @Query("academicYearId") academicYearId?: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
  ) {
    if (!academicYearId) throw new BadRequestException("academicYearId query param is required");
    return this.reports.attendanceByClass(user, schoolId, academicYearId, from, to);
  }
}
