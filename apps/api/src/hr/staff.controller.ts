import { Body, Controller, Delete, Get, Param, Patch, Post } from "@nestjs/common";
import { StaffService } from "./staff.service";
import { CreateStaffDto } from "./dto/create-staff.dto";
import { UpdateStaffDto } from "./dto/update-staff.dto";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { RequirePermissions } from "../auth/decorators/require-permissions.decorator";
import type { AuthenticatedUser } from "../auth/types/authenticated-user";

@Controller("schools/:schoolId/staff")
export class StaffController {
  constructor(private readonly staff: StaffService) {}

  @RequirePermissions("staff.view")
  @Get()
  list(@CurrentUser() user: AuthenticatedUser, @Param("schoolId") schoolId: string) {
    return this.staff.listForSchool(user, schoolId);
  }

  @RequirePermissions("staff.create")
  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Param("schoolId") schoolId: string, @Body() dto: CreateStaffDto) {
    return this.staff.create(user, schoolId, dto);
  }

  @RequirePermissions("staff.view")
  @Get(":staffId")
  getOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param("schoolId") schoolId: string,
    @Param("staffId") staffId: string,
  ) {
    return this.staff.getOne(user, schoolId, staffId);
  }

  @RequirePermissions("staff.update")
  @Patch(":staffId")
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param("schoolId") schoolId: string,
    @Param("staffId") staffId: string,
    @Body() dto: UpdateStaffDto,
  ) {
    return this.staff.update(user, schoolId, staffId, dto);
  }

  @RequirePermissions("staff.update")
  @Delete(":staffId")
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param("schoolId") schoolId: string,
    @Param("staffId") staffId: string,
  ) {
    return this.staff.remove(user, schoolId, staffId);
  }
}
