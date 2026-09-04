import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import { StudentLifecycleService, type LifecycleListFilters } from "./student-lifecycle.service";
import { PreviewForm1TransitionDto } from "./dto/preview-form1-transition.dto";
import { ConfirmForm1TransitionDto } from "./dto/confirm-form1-transition.dto";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { RequirePermissions } from "../auth/decorators/require-permissions.decorator";
import type { AuthenticatedUser } from "../auth/types/authenticated-user";

interface LifecycleListQuery {
  schoolId?: string;
  academicYearId?: string;
  search?: string;
  status?: string;
  page?: string;
  pageSize?: string;
}

function parseListFilters(query: LifecycleListQuery): LifecycleListFilters {
  return {
    schoolId: query.schoolId,
    academicYearId: query.academicYearId,
    search: query.search,
    status: query.status,
    page: query.page ? Number(query.page) : undefined,
    pageSize: query.pageSize ? Number(query.pageSize) : undefined,
  };
}

// Read endpoints are org-wide-capable (no :schoolId in the path) — a School
// Admin is scoped to their own school automatically by
// StudentLifecycleService.resolveSchoolIds, exactly like the Audit Log's
// GET /audit-logs. Form 1 Transition is a write action and stays
// school-scoped in the path, matching every other mutation in this app
// (attendance, promotions, transfers).
@Controller()
export class StudentLifecycleController {
  constructor(private readonly lifecycle: StudentLifecycleService) {}

  @RequirePermissions("students.view")
  @Get("student-lifecycle/summary")
  getSummary(@CurrentUser() user: AuthenticatedUser, @Query() query: LifecycleListQuery) {
    return this.lifecycle.getSummary(user, { schoolId: query.schoolId, academicYearId: query.academicYearId });
  }

  @RequirePermissions("students.view")
  @Get("student-lifecycle/primary-completed")
  listPrimaryCompleted(@CurrentUser() user: AuthenticatedUser, @Query() query: LifecycleListQuery) {
    return this.lifecycle.listPrimaryCompleted(user, parseListFilters(query));
  }

  @RequirePermissions("students.view")
  @Get("student-lifecycle/awaiting-enrollment")
  listAwaitingEnrollment(@CurrentUser() user: AuthenticatedUser, @Query() query: LifecycleListQuery) {
    return this.lifecycle.listAwaitingEnrollment(user, parseListFilters(query));
  }

  @RequirePermissions("students.view")
  @Get("student-lifecycle/secondary-graduated")
  listSecondaryGraduated(@CurrentUser() user: AuthenticatedUser, @Query() query: LifecycleListQuery) {
    return this.lifecycle.listSecondaryGraduated(user, parseListFilters(query));
  }

  @RequirePermissions("students.view")
  @Get("student-lifecycle/alumni")
  listAlumni(@CurrentUser() user: AuthenticatedUser, @Query() query: LifecycleListQuery) {
    return this.lifecycle.listAlumni(user, parseListFilters(query));
  }

  @RequirePermissions("promotions.execute")
  @Post("schools/:schoolId/student-lifecycle/form-1-transition/preview")
  previewForm1Transition(
    @CurrentUser() user: AuthenticatedUser,
    @Param("schoolId") schoolId: string,
    @Body() dto: PreviewForm1TransitionDto,
  ) {
    return this.lifecycle.previewForm1Transition(user, schoolId, dto);
  }

  @RequirePermissions("promotions.execute")
  @Post("schools/:schoolId/student-lifecycle/form-1-transition/confirm")
  confirmForm1Transition(
    @CurrentUser() user: AuthenticatedUser,
    @Param("schoolId") schoolId: string,
    @Body() dto: ConfirmForm1TransitionDto,
  ) {
    return this.lifecycle.confirmForm1Transition(user, schoolId, dto);
  }
}
