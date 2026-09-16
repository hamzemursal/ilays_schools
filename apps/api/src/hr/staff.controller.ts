import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { StaffService } from "./staff.service";
import { CreateStaffDto } from "./dto/create-staff.dto";
import { UpdateStaffDto } from "./dto/update-staff.dto";
import { CreateStaffAssignmentInputDto } from "./dto/create-staff-assignment-input.dto";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { RequirePermissions } from "../auth/decorators/require-permissions.decorator";
import type { AuthenticatedUser } from "../auth/types/authenticated-user";

@Controller("schools/:schoolId/staff")
export class StaffController {
  constructor(private readonly staff: StaffService) {}

  // Bare GET stays dual-purpose, same as TeachersController/GuardiansController:
  // ?search=... is the org-wide "find an existing staff member to assign
  // here" lookup; no search param returns this school's own staff list.
  @RequirePermissions("staff.view")
  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Param("schoolId") schoolId: string,
    @Query("search") search?: string,
  ) {
    if (search !== undefined) return this.staff.searchAcrossOrg(user, schoolId, search);
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

  @RequirePermissions("staff.update")
  @Post(":staffId/assignments")
  assignToSchool(
    @CurrentUser() user: AuthenticatedUser,
    @Param("schoolId") schoolId: string,
    @Param("staffId") staffId: string,
    @Body() dto: CreateStaffAssignmentInputDto,
  ) {
    return this.staff.assignToSchool(user, schoolId, staffId, dto);
  }

  @RequirePermissions("staff.update")
  @Post(":staffId/assignments/:assignmentId/deactivate")
  deactivateAssignment(
    @CurrentUser() user: AuthenticatedUser,
    @Param("schoolId") schoolId: string,
    @Param("staffId") staffId: string,
    @Param("assignmentId") assignmentId: string,
  ) {
    return this.staff.deactivateAssignment(user, schoolId, staffId, assignmentId);
  }
}
