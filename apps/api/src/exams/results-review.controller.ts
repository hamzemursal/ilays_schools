import { Controller, Get, Param, Query } from "@nestjs/common";
import { ExamsService, type ResultSubmissionListFilters } from "./exams.service";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { RequirePermissions } from "../auth/decorators/require-permissions.decorator";
import type { AuthenticatedUser } from "../auth/types/authenticated-user";

// Same @Controller() + explicit-full-path shape as ExamPapersController —
// needs both an org-wide listing (Super/Org Admin) and a school-scoped one.
@Controller()
export class ResultsReviewController {
  constructor(private readonly exams: ExamsService) {}

  @RequirePermissions("results.approve")
  @Get("results-review")
  listAll(@CurrentUser() user: AuthenticatedUser, @Query() query: ResultSubmissionListFilters) {
    return this.exams.listResultSubmissions(user, query);
  }

  @RequirePermissions("results.approve")
  @Get("schools/:schoolId/results-review")
  listForSchool(
    @CurrentUser() user: AuthenticatedUser,
    @Param("schoolId") schoolId: string,
    @Query() query: ResultSubmissionListFilters,
  ) {
    return this.exams.listResultSubmissions(user, { ...query, schoolId });
  }
}
