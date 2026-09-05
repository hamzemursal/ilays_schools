import { Controller, Get, Param, Query } from "@nestjs/common";
import { ExamsService, type ExamPaperListFilters } from "./exams.service";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { RequirePermissions } from "../auth/decorators/require-permissions.decorator";
import type { AuthenticatedUser } from "../auth/types/authenticated-user";

// @Controller() with explicit full paths on each route, not a shared
// prefix — same shape as TransfersController — because this needs both an
// org-wide listing ("exam-papers", Super/Org Admin) and a school-scoped one
// ("schools/:schoolId/exam-papers"), and Nest controllers only support one
// class-level prefix.
@Controller()
export class ExamPapersController {
  constructor(private readonly exams: ExamsService) {}

  @RequirePermissions("results.view")
  @Get("exam-papers")
  listAll(@CurrentUser() user: AuthenticatedUser, @Query() query: ExamPaperListFilters) {
    return this.exams.listExamPapers(user, query);
  }

  @RequirePermissions("results.view")
  @Get("schools/:schoolId/exam-papers")
  listForSchool(
    @CurrentUser() user: AuthenticatedUser,
    @Param("schoolId") schoolId: string,
    @Query() query: ExamPaperListFilters,
  ) {
    return this.exams.listExamPapers(user, { ...query, schoolId });
  }
}
