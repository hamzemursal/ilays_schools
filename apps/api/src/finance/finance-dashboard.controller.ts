import { Controller, Get, Param, Query } from "@nestjs/common";
import { FinanceDashboardService } from "./finance-dashboard.service";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { RequirePermissions } from "../auth/decorators/require-permissions.decorator";
import type { AuthenticatedUser } from "../auth/types/authenticated-user";

@Controller("schools/:schoolId/finance/dashboard-summary")
export class FinanceDashboardController {
  constructor(private readonly dashboard: FinanceDashboardService) {}

  @RequirePermissions("finance.dashboard.view")
  @Get()
  get(
    @CurrentUser() user: AuthenticatedUser,
    @Param("schoolId") schoolId: string,
    @Query("academicYearId") academicYearId?: string,
  ) {
    return this.dashboard.getSchoolSummary(user, schoolId, academicYearId);
  }
}
