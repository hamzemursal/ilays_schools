import { Controller, Get } from "@nestjs/common";
import { FinanceDashboardService } from "./finance-dashboard.service";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { RequirePermissions } from "../auth/decorators/require-permissions.decorator";
import type { AuthenticatedUser } from "../auth/types/authenticated-user";

// No :schoolId in this route on purpose — see FinanceDashboardService
// .getCentralSummary for why the school set always comes from the actor's
// own UserSchool grants, never a client-supplied parameter.
@Controller("central-finance/dashboard-summary")
export class CentralFinanceDashboardController {
  constructor(private readonly dashboard: FinanceDashboardService) {}

  @RequirePermissions("finance.central.view")
  @Get()
  get(@CurrentUser() user: AuthenticatedUser) {
    return this.dashboard.getCentralSummary(user);
  }
}
