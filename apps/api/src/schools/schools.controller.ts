import { Body, Controller, Delete, Get, Param, Post } from "@nestjs/common";
import { SchoolsService } from "./schools.service";
import { CreateSchoolDto } from "./dto/create-school.dto";
import { InviteSchoolAdminDto } from "./dto/invite-school-admin.dto";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { RequirePermissions } from "../auth/decorators/require-permissions.decorator";
import type { AuthenticatedUser } from "../auth/types/authenticated-user";

@Controller("schools")
export class SchoolsController {
  constructor(private readonly schools: SchoolsService) {}

  @RequirePermissions("schools.view")
  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.schools.findAccessible(user);
  }

  @RequirePermissions("schools.create")
  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateSchoolDto) {
    return this.schools.create(user, dto);
  }

  // Must come before ":id" — otherwise Nest would match "directory" as an id.
  @RequirePermissions("transfers.create")
  @Get("directory")
  directory(@CurrentUser() user: AuthenticatedUser) {
    return this.schools.listDirectory(user);
  }

  // Must come before ":id" for the same reason as "directory" above. Gated
  // on the same "schools.view" as the plain list — a Super Admin sees every
  // school's totals, a School Admin (schoolIds non-empty) would only ever
  // see totals for their own school(s), never another school's data.
  @RequirePermissions("schools.view")
  @Get("system-summary")
  systemSummary(@CurrentUser() user: AuthenticatedUser) {
    return this.schools.getSystemSummary(user);
  }

  @RequirePermissions("schools.view")
  @Get(":id")
  get(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return this.schools.findOneAccessibleOrThrow(user, id);
  }

  // schools.manage is only ever granted to SUPER_ADMIN/ORGANIZATION_ADMIN
  // (see seed.ts) — a School Admin can never reach this even for their own
  // school, which is deliberate: deleting a school is an org-wide decision.
  @RequirePermissions("schools.manage")
  @Delete(":id")
  remove(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return this.schools.remove(user, id);
  }

  @RequirePermissions("schools.manage")
  @Post(":id/invite-admin")
  inviteAdmin(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Body() dto: InviteSchoolAdminDto,
  ) {
    return this.schools.inviteAdmin(user, id, dto.email);
  }

  // Divisions are read-only here — they're created automatically as a direct
  // consequence of the school's chosen type (see SchoolsService.create) and
  // are never user-created, but a School Admin needs to read them to pick
  // which one a new class belongs to.
  @RequirePermissions("academic.view")
  @Get(":id/divisions")
  listDivisions(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return this.schools.listDivisions(user, id);
  }
}
