import { Controller, Get, Param, Query } from "@nestjs/common";
import { GuardiansService } from "./guardians.service";
import { SchoolsService } from "../schools/schools.service";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { RequirePermissions } from "../auth/decorators/require-permissions.decorator";
import type { AuthenticatedUser } from "../auth/types/authenticated-user";

@Controller("schools/:schoolId/guardians")
export class GuardiansController {
  constructor(
    private readonly guardians: GuardiansService,
    private readonly schools: SchoolsService,
  ) {}

  @RequirePermissions("guardians.view")
  @Get()
  async search(
    @CurrentUser() user: AuthenticatedUser,
    @Param("schoolId") schoolId: string,
    @Query("search") search?: string,
  ) {
    await this.schools.findOneAccessibleOrThrow(user, schoolId);
    return this.guardians.searchForSchool(user.organizationId!, schoolId, search ?? "");
  }
}
