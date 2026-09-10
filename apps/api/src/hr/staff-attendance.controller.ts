import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import { StaffAttendanceService } from "./staff-attendance.service";
import { MarkStaffAttendanceDto } from "./dto/mark-staff-attendance.dto";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { RequirePermissions } from "../auth/decorators/require-permissions.decorator";
import type { AuthenticatedUser } from "../auth/types/authenticated-user";

@Controller("schools/:schoolId/staff-attendance")
export class StaffAttendanceController {
  constructor(private readonly staffAttendance: StaffAttendanceService) {}

  @RequirePermissions("hr.attendance.view")
  @Get()
  list(@CurrentUser() user: AuthenticatedUser, @Param("schoolId") schoolId: string, @Query("date") date?: string) {
    return this.staffAttendance.listForSchool(user, schoolId, date);
  }

  @RequirePermissions("hr.attendance.mark")
  @Post()
  mark(
    @CurrentUser() user: AuthenticatedUser,
    @Param("schoolId") schoolId: string,
    @Body() dto: MarkStaffAttendanceDto,
  ) {
    return this.staffAttendance.mark(user, schoolId, dto);
  }
}
