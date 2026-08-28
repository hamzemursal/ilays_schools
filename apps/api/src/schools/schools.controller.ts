import { Body, Controller, Get, Param, Post } from "@nestjs/common";
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

  @RequirePermissions("schools.view")
  @Get(":id")
  get(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return this.schools.findOneAccessibleOrThrow(user, id);
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
