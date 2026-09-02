import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { ClassesService } from "./classes.service";
import { CreateClassDto } from "./dto/create-class.dto";
import { UpdateClassDto } from "./dto/update-class.dto";
import { CreateSectionDto } from "./dto/create-section.dto";
import { UpdateSectionDto } from "./dto/update-section.dto";
import { AssignSubjectDto } from "./dto/assign-subject.dto";
import { BulkTransferClassDto } from "./dto/bulk-transfer-class.dto";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { RequirePermissions } from "../auth/decorators/require-permissions.decorator";
import type { AuthenticatedUser } from "../auth/types/authenticated-user";

@Controller("schools/:schoolId/classes")
export class ClassesController {
  constructor(private readonly classes: ClassesService) {}

  @RequirePermissions("academic.view")
  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Param("schoolId") schoolId: string,
    @Query("academicYearId") academicYearId?: string,
  ) {
    return this.classes.list(user, schoolId, academicYearId);
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

  @RequirePermissions("academic.manage")
  @Patch(":classId")
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param("schoolId") schoolId: string,
    @Param("classId") classId: string,
    @Body() dto: UpdateClassDto,
  ) {
    return this.classes.update(user, schoolId, classId, dto);
  }

  @RequirePermissions("academic.manage")
  @Delete(":classId")
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param("schoolId") schoolId: string,
    @Param("classId") classId: string,
  ) {
    return this.classes.remove(user, schoolId, classId);
  }

  @RequirePermissions("academic.view")
  @Get(":classId/sections")
  listSections(
    @CurrentUser() user: AuthenticatedUser,
    @Param("schoolId") schoolId: string,
    @Param("classId") classId: string,
    @Query("academicYearId") academicYearId?: string,
  ) {
    return this.classes.listSections(user, schoolId, classId, academicYearId);
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
    return this.classes.updateSection(user, schoolId, classId, sectionId, dto);
  }

  @RequirePermissions("academic.manage")
  @Delete(":classId/sections/:sectionId")
  removeSection(
    @CurrentUser() user: AuthenticatedUser,
    @Param("schoolId") schoolId: string,
    @Param("classId") classId: string,
    @Param("sectionId") sectionId: string,
  ) {
    return this.classes.removeSection(user, schoolId, classId, sectionId);
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

  // Real counts shown before the confirm-dialog's typed-confirmation gate —
  // see ClassesService.getBulkTransferImpact for exactly what's counted.
  @RequirePermissions("academic.manage")
  @Get(":classId/bulk-transfer-impact")
  getBulkTransferImpact(
    @CurrentUser() user: AuthenticatedUser,
    @Param("schoolId") schoolId: string,
    @Param("classId") classId: string,
    @Query("academicYearId") academicYearId: string,
    @Query("fromSectionId") fromSectionId?: string,
  ) {
    return this.classes.getBulkTransferImpact(user, schoolId, classId, academicYearId, fromSectionId);
  }

  @RequirePermissions("academic.manage")
  @Post(":classId/bulk-transfer")
  bulkTransfer(
    @CurrentUser() user: AuthenticatedUser,
    @Param("schoolId") schoolId: string,
    @Param("classId") classId: string,
    @Body() dto: BulkTransferClassDto,
  ) {
    return this.classes.bulkTransfer(user, schoolId, classId, dto);
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
