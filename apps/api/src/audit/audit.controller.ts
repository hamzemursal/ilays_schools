import { Controller, Get, Param, Query } from "@nestjs/common";
import { AuditService } from "./audit.service";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { RequirePermissions } from "../auth/decorators/require-permissions.decorator";
import type { AuthenticatedUser } from "../auth/types/authenticated-user";

@Controller("schools/:schoolId/audit-logs")
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @RequirePermissions("audit.view")
  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Param("schoolId") schoolId: string,
    @Query("action") action?: string,
  ) {
    return this.audit.listForSchool(user, schoolId, action);
  }
}
