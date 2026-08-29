import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { ClassesService } from "./classes.service";
import { CreateClassDto } from "./dto/create-class.dto";
import { CreateSectionDto } from "./dto/create-section.dto";
import { UpdateSectionDto } from "./dto/update-section.dto";
import { AssignSubjectDto } from "./dto/assign-subject.dto";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { RequirePermissions } from "../auth/decorators/require-permissions.decorator";
import type { AuthenticatedUser } from "../auth/types/authenticated-user";

@Controller("schools/:schoolId/classes")
export class ClassesController {
  constructor(private readonly classes: ClassesService) {}

  @RequirePermissions("academic.view")
  @Get()
  list(@CurrentUser() user: AuthenticatedUser, @Param("schoolId") schoolId: string) {
    return this.classes.list(user, schoolId);
  }

  @RequirePermissions("academic.manage")
  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param("schoolId") schoolId: string,
    @Body() dto: CreateClassDto,
  ) {
    return this.classes.create(user, schoolId, dto);
  }

  @RequirePermissions("academic.view")
  @Get(":classId/sections")
  listSections(
    @CurrentUser() user: AuthenticatedUser,
    @Param("schoolId") schoolId: string,
    @Param("classId") classId: string,
  ) {
    return this.classes.listSections(user, schoolId, classId);
  }

  @RequirePermissions("academic.manage")
  @Post(":classId/sections")
  createSection(
    @CurrentUser() user: AuthenticatedUser,
    @Param("schoolId") schoolId: string,
    @Param("classId") classId: string,
    @Body() dto: CreateSectionDto,
  ) {
    return this.classes.createSection(user, schoolId, classId, dto);
  }

  @RequirePermissions("academic.manage")
  @Patch(":classId/sections/:sectionId")
  updateSection(
    @CurrentUser() user: AuthenticatedUser,
    @Param("schoolId") schoolId: string,
    @Param("classId") classId: string,
    @Param("sectionId") sectionId: string,
    @Body() dto: UpdateSectionDto,
  ) {
    return this.classes.updateSectionCapacity(user, schoolId, classId, sectionId, dto);
  }

  @RequirePermissions("academic.view")
  @Get(":classId/subjects")
  listSubjects(
    @CurrentUser() user: AuthenticatedUser,
    @Param("schoolId") schoolId: string,
    @Param("classId") classId: string,
  ) {
    return this.classes.listSubjects(user, schoolId, classId);
  }

  @RequirePermissions("academic.manage")
  @Post(":classId/subjects")
  assignSubject(
    @CurrentUser() user: AuthenticatedUser,
    @Param("schoolId") schoolId: string,
    @Param("classId") classId: string,
    @Body() dto: AssignSubjectDto,
  ) {
    return this.classes.assignSubject(user, schoolId, classId, dto);
  }

  @RequirePermissions("academic.view")
  @Get(":classId/sections/:sectionId/teacher-assignments")
  listSectionTeacherAssignments(
    @CurrentUser() user: AuthenticatedUser,
    @Param("schoolId") schoolId: string,
    @Param("classId") classId: string,
    @Param("sectionId") sectionId: string,
    @Query("academicYearId") academicYearId: string,
  ) {
    return this.classes.listSectionTeacherAssignments(user, schoolId, classId, sectionId, academicYearId);
  }

  @RequirePermissions("academic.manage")
  @Delete(":classId/subjects/:subjectId")
  unassignSubject(
    @CurrentUser() user: AuthenticatedUser,
    @Param("schoolId") schoolId: string,
    @Param("classId") classId: string,
    @Param("subjectId") subjectId: string,
  ) {
    return this.classes.unassignSubject(user, schoolId, classId, subjectId);
  }
}
