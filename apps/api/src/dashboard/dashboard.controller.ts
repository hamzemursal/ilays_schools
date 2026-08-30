import { Controller, Get, Param, Query } from "@nestjs/common";
import { DashboardService } from "./dashboard.service";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { RequirePermissions } from "../auth/decorators/require-permissions.decorator";
import type { AuthenticatedUser } from "../auth/types/authenticated-user";

@Controller("schools/:schoolId/dashboard-summary")
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  // Gated on academic.view rather than a new permission key: in practice
  // this is exactly "is a School/Org/Super Admin for this school", which is
  // what every existing grant of academic.view already means, and it
  // correctly excludes Teachers from seeing school-wide financial totals.
  @RequirePermissions("academic.view")
  @Get()
  getSummary(
    @CurrentUser() user: AuthenticatedUser,
    @Param("schoolId") schoolId: string,
    @Query("academicYearId") academicYearId?: string,
  ) {
    return this.dashboard.getSummary(user, schoolId, academicYearId);
  }
}
