import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { GuardiansService } from "./guardians.service";
import { SchoolsService } from "../schools/schools.service";
import { CreateGuardianDto } from "./dto/create-guardian.dto";
import { UpdateGuardianDto } from "./dto/update-guardian.dto";
import { LinkChildDto } from "./dto/link-child.dto";
import { CreatePortalAccountDto } from "./dto/create-portal-account.dto";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { RequirePermissions } from "../auth/decorators/require-permissions.decorator";
import type { AuthenticatedUser } from "../auth/types/authenticated-user";

@Controller("schools/:schoolId/guardians")
export class GuardiansController {
  constructor(
    private readonly guardians: GuardiansService,
    private readonly schools: SchoolsService,
  ) {}

  // Bare GET stays dual-purpose: ?search=... keeps the existing narrow
  // "find a guardian to link to a student" lookup the Student wizard already
  // calls; no search param returns the full Parents management list instead.
  @RequirePermissions("guardians.view")
  @Get()
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Param("schoolId") schoolId: string,
    @Query("search") search?: string,
  ) {
    await this.schools.findOneAccessibleOrThrow(user, schoolId);
    if (search !== undefined) return this.guardians.searchForSchool(user.organizationId!, schoolId, search);
    return this.guardians.list(user, schoolId);
  }

  @RequirePermissions("guardians.manage")
  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param("schoolId") schoolId: string,
    @Body() dto: CreateGuardianDto,
  ) {
    return this.guardians.create(user, schoolId, dto);
  }

  @RequirePermissions("guardians.view")
  @Get(":guardianId")
  getOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param("schoolId") schoolId: string,
    @Param("guardianId") guardianId: string,
  ) {
    return this.guardians.getOne(user, schoolId, guardianId);
  }

  @RequirePermissions("guardians.manage")
  @Patch(":guardianId")
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param("schoolId") schoolId: string,
    @Param("guardianId") guardianId: string,
    @Body() dto: UpdateGuardianDto,
  ) {
    return this.guardians.update(user, schoolId, guardianId, dto);
  }

  @RequirePermissions("guardians.manage")
  @Delete(":guardianId")
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param("schoolId") schoolId: string,
    @Param("guardianId") guardianId: string,
  ) {
    return this.guardians.remove(user, schoolId, guardianId);
  }

  @RequirePermissions("guardians.manage")
  @Post(":guardianId/children")
  addChild(
    @CurrentUser() user: AuthenticatedUser,
    @Param("schoolId") schoolId: string,
    @Param("guardianId") guardianId: string,
    @Body() dto: LinkChildDto,
  ) {
    return this.guardians.addChild(user, schoolId, guardianId, dto);
  }

  @RequirePermissions("guardians.manage")
  @Delete(":guardianId/children/:studentId")
  removeChild(
    @CurrentUser() user: AuthenticatedUser,
    @Param("schoolId") schoolId: string,
    @Param("guardianId") guardianId: string,
    @Param("studentId") studentId: string,
  ) {
    return this.guardians.removeChild(user, schoolId, guardianId, studentId);
  }

  @RequirePermissions("guardians.manage")
  @Post(":guardianId/portal-account")
  createPortalAccount(
    @CurrentUser() user: AuthenticatedUser,
    @Param("schoolId") schoolId: string,
    @Param("guardianId") guardianId: string,
    @Body() dto: CreatePortalAccountDto,
  ) {
    return this.guardians.createPortalAccount(user, schoolId, guardianId, dto);
  }
}
