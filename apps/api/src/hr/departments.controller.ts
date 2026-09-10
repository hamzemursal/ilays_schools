import { Body, Controller, Get, Param, Patch, Post } from "@nestjs/common";
import { DepartmentsService } from "./departments.service";
import { CreateDepartmentDto } from "./dto/create-department.dto";
import { UpdateDepartmentDto } from "./dto/update-department.dto";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { RequirePermissions } from "../auth/decorators/require-permissions.decorator";
import type { AuthenticatedUser } from "../auth/types/authenticated-user";

@Controller("schools/:schoolId/departments")
export class DepartmentsController {
  constructor(private readonly departments: DepartmentsService) {}

  @RequirePermissions("staff.view")
  @Get()
  list(@CurrentUser() user: AuthenticatedUser, @Param("schoolId") schoolId: string) {
    return this.departments.listForSchool(user, schoolId);
  }

  @RequirePermissions("departments.manage")
  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Param("schoolId") schoolId: string, @Body() dto: CreateDepartmentDto) {
    return this.departments.create(user, schoolId, dto);
  }

  @RequirePermissions("departments.manage")
  @Patch(":departmentId")
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param("schoolId") schoolId: string,
    @Param("departmentId") departmentId: string,
    @Body() dto: UpdateDepartmentDto,
  ) {
    return this.departments.update(user, schoolId, departmentId, dto);
  }
}
