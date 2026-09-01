import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { StudentsService } from "./students.service";
import { StudentPortalService } from "./student-portal.service";
import { CreateStudentDto } from "./dto/create-student.dto";
import { UpdateStudentDto } from "./dto/update-student.dto";
import { GuardianInputDto } from "../guardians/dto/guardian-input.dto";
import { GuardiansService } from "../guardians/guardians.service";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { RequirePermissions } from "../auth/decorators/require-permissions.decorator";
import type { AuthenticatedUser } from "../auth/types/authenticated-user";
import { PrismaService } from "../prisma/prisma.service";

@Controller()
export class StudentsController {
  constructor(
    private readonly students: StudentsService,
    private readonly portal: StudentPortalService,
    private readonly guardians: GuardiansService,
    private readonly prisma: PrismaService,
  ) {}

  @RequirePermissions("students.view")
  @Get("schools/:schoolId/students")
  listForSchool(@CurrentUser() user: AuthenticatedUser, @Param("schoolId") schoolId: string) {
    return this.students.listForSchool(user, schoolId);
  }

  @RequirePermissions("students.create")
  @Post("schools/:schoolId/students")
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param("schoolId") schoolId: string,
    @Body() dto: CreateStudentDto,
  ) {
    return this.students.create(user, schoolId, dto);
  }

  // The Student Portal (self-service, no @RequirePermissions — same as the
  // Guardian Portal) is deliberately declared here, before "students/:id",
  // not in its own controller. Nest/Express matches routes in registration
  // order, and "students/:id" would otherwise swallow "students/me" by
  // treating "me" as the id — same hazard already solved for
  // "schools/directory" vs "schools/:id" in SchoolsController. There is no
  // studentId param anywhere below: every route resolves strictly from the
  // authenticated actor's own linked Student record.
  @Get("students/me")
  myProfile(@CurrentUser() user: AuthenticatedUser) {
    return this.portal.myProfile(user);
  }

  @Get("students/me/academic-years")
  myAcademicYears(@CurrentUser() user: AuthenticatedUser) {
    return this.portal.myAcademicYears(user);
  }

  @Get("students/me/subjects")
  mySubjects(@CurrentUser() user: AuthenticatedUser, @Query("academicYearId") academicYearId?: string) {
    return this.portal.mySubjects(user, academicYearId);
  }

  @Get("students/me/attendance")
  myAttendance(@CurrentUser() user: AuthenticatedUser, @Query("academicYearId") academicYearId?: string) {
    return this.portal.myAttendance(user, academicYearId);
  }

  @Get("students/me/results")
  myResults(@CurrentUser() user: AuthenticatedUser) {
    return this.portal.myResults(user);
  }

  @Get("students/me/invoices")
  myInvoices(@CurrentUser() user: AuthenticatedUser) {
    return this.portal.myInvoices(user);
  }

  @Get("students/me/announcements")
  myAnnouncements(@CurrentUser() user: AuthenticatedUser) {
    return this.portal.myAnnouncements(user);
  }

  @RequirePermissions("students.view")
  @Get("students/:id")
  getOne(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return this.students.getOne(user, id);
  }

  @RequirePermissions("students.update")
  @Patch("students/:id")
  update(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Body() dto: UpdateStudentDto) {
    return this.students.update(user, id, dto);
  }

  @RequirePermissions("students.archive")
  @Post("students/:id/archive")
  archive(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return this.students.archive(user, id);
  }

  @RequirePermissions("students.archive")
  @Delete("students/:id")
  remove(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return this.students.remove(user, id);
  }

  // Gated by students.update, not a new permission — creating this account
  // is a natural extension of managing the student record, same reasoning
  // guardians.manage already covers Guardian portal-account creation below.
  @RequirePermissions("students.update")
  @Post("students/:id/portal-account")
  createPortalAccount(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return this.students.createPortalAccount(user, id);
  }

  @RequirePermissions("guardians.manage")
  @Post("students/:id/guardians")
  async addGuardian(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Body() dto: GuardianInputDto,
  ) {
    await this.students.assertAccessibleStudent(user, id);
    const guardian = await this.guardians.findOrCreate(this.prisma, dto);
    await this.guardians.linkToStudent(this.prisma, id, guardian.id, dto.relationship, dto.isPrimaryContact);
    return guardian;
  }
}
