import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { SubjectsService } from "./subjects.service";
import { CreateSubjectDto } from "./dto/create-subject.dto";
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
}
