import { Body, Controller, Delete, Get, Param, Patch, Post } from "@nestjs/common";
import { SubjectsService } from "./subjects.service";
import { CreateSubjectDto } from "./dto/create-subject.dto";
import { UpdateSubjectDto } from "./dto/update-subject.dto";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { RequirePermissions } from "../auth/decorators/require-permissions.decorator";
import type { AuthenticatedUser } from "../auth/types/authenticated-user";

@Controller("schools/:schoolId/subjects")
export class SubjectsController {
  constructor(private readonly subjects: SubjectsService) {}

  @RequirePermissions("academic.view")
  @Get()
  list(@CurrentUser() user: AuthenticatedUser, @Param("schoolId") schoolId: string) {
    return this.subjects.list(user, schoolId);
  }

  @RequirePermissions("academic.manage")
  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param("schoolId") schoolId: string,
    @Body() dto: CreateSubjectDto,
  ) {
    return this.subjects.create(user, schoolId, dto);
  }

  @RequirePermissions("academic.manage")
  @Patch(":subjectId")
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param("schoolId") schoolId: string,
    @Param("subjectId") subjectId: string,
    @Body() dto: UpdateSubjectDto,
  ) {
    return this.subjects.update(user, schoolId, subjectId, dto);
  }

  @RequirePermissions("academic.manage")
  @Delete(":subjectId")
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param("schoolId") schoolId: string,
    @Param("subjectId") subjectId: string,
  ) {
    return this.subjects.remove(user, schoolId, subjectId);
  }
}
