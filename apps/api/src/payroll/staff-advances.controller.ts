import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import { StaffAdvancesService } from "./staff-advances.service";
import { CreateStaffAdvanceDto } from "./dto/create-staff-advance.dto";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { RequirePermissions } from "../auth/decorators/require-permissions.decorator";
import type { AuthenticatedUser } from "../auth/types/authenticated-user";

@Controller("schools/:schoolId/staff-advances")
export class StaffAdvancesController {
  constructor(private readonly staffAdvances: StaffAdvancesService) {}

  @RequirePermissions("payroll.view")
  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Param("schoolId") schoolId: string,
    @Query("teacherId") teacherId?: string,
    @Query("staffId") staffId?: string,
  ) {
    return this.staffAdvances.listForSchool(user, schoolId, teacherId, staffId);
  }

  @RequirePermissions("payroll.prepare")
  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param("schoolId") schoolId: string,
    @Body() dto: CreateStaffAdvanceDto,
  ) {
    return this.staffAdvances.create(user, schoolId, dto);
  }
}
