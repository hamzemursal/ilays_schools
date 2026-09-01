import { Controller, Get, Param, Patch, Query } from "@nestjs/common";
import { GuardianPortalService } from "./guardian-portal.service";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import type { AuthenticatedUser } from "../auth/types/authenticated-user";

// A parent acting on their own account/children — every route here is gated
// only by authentication (JwtAuthGuard, applied globally), never an
// admin-level @RequirePermissions key. See GuardianPortalService for the
// authorization chain this relies on instead. The child-photo route lives in
// the documents module instead (see GuardianChildPhotoController) to avoid a
// circular module dependency.
@Controller("guardians/me")
export class GuardianPortalController {
  constructor(private readonly portal: GuardianPortalService) {}

  @Get()
  profile(@CurrentUser() user: AuthenticatedUser) {
    return this.portal.myProfile(user);
  }

  @Get("children")
  children(@CurrentUser() user: AuthenticatedUser) {
    return this.portal.myChildren(user);
  }

  @Get("children/:studentId")
  child(@CurrentUser() user: AuthenticatedUser, @Param("studentId") studentId: string) {
    return this.portal.myChild(user, studentId);
  }

  @Get("children/:studentId/academic-years")
  childAcademicYears(@CurrentUser() user: AuthenticatedUser, @Param("studentId") studentId: string) {
    return this.portal.myChildAcademicYears(user, studentId);
  }

  @Get("children/:studentId/subjects")
  childSubjects(
    @CurrentUser() user: AuthenticatedUser,
    @Param("studentId") studentId: string,
    @Query("academicYearId") academicYearId?: string,
  ) {
    return this.portal.myChildSubjects(user, studentId, academicYearId);
  }

  @Get("children/:studentId/attendance")
  childAttendance(
    @CurrentUser() user: AuthenticatedUser,
    @Param("studentId") studentId: string,
    @Query("academicYearId") academicYearId?: string,
  ) {
    return this.portal.myChildAttendance(user, studentId, academicYearId);
  }

  @Get("children/:studentId/exams")
  childResults(@CurrentUser() user: AuthenticatedUser, @Param("studentId") studentId: string) {
    return this.portal.myChildResults(user, studentId);
  }

  @Get("children/:studentId/fees")
  childInvoices(@CurrentUser() user: AuthenticatedUser, @Param("studentId") studentId: string) {
    return this.portal.myChildInvoices(user, studentId);
  }

  @Get("announcements")
  announcements(@CurrentUser() user: AuthenticatedUser) {
    return this.portal.myAnnouncements(user);
  }

  @Get("notifications")
  notifications(@CurrentUser() user: AuthenticatedUser) {
    return this.portal.myNotifications(user);
  }

  @Patch("notifications/:id/read")
  markRead(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return this.portal.markNotificationRead(user, id);
  }
}
