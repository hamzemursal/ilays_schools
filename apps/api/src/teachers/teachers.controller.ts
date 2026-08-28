import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { TeachersService } from "./teachers.service";
import { CreateTeacherDto } from "./dto/create-teacher.dto";
import { CreateTeacherAssignmentInputDto } from "./dto/create-teacher-assignment-input.dto";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { RequirePermissions } from "../auth/decorators/require-permissions.decorator";
import type { AuthenticatedUser } from "../auth/types/authenticated-user";

@Controller("schools/:schoolId/teachers")
export class TeachersController {
  constructor(private readonly teachers: TeachersService) {}

  @RequirePermissions("teachers.view")
  @Get()
  list(@CurrentUser() user: AuthenticatedUser, @Param("schoolId") schoolId: string) {
    return this.teachers.listForSchool(user, schoolId);
  }

  @RequirePermissions("teachers.create")
  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param("schoolId") schoolId: string,
    @Body() dto: CreateTeacherDto,
  ) {
    return this.teachers.create(user, schoolId, dto);
  }

  @RequirePermissions("teachers.update")
  @Post(":teacherId/assignments")
  addAssignment(
    @CurrentUser() user: AuthenticatedUser,
    @Param("schoolId") schoolId: string,
    @Param("teacherId") teacherId: string,
    @Body() dto: CreateTeacherAssignmentInputDto,
  ) {
    return this.teachers.addAssignment(user, schoolId, teacherId, dto);
  }
}
