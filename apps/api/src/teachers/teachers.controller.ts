import { Body, Controller, Get, Param, Patch, Post, UploadedFile, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { TeachersService } from "./teachers.service";
import { DocumentsService } from "../documents/documents.service";
import { CreateTeacherDto } from "./dto/create-teacher.dto";
import { CreateTeacherAssignmentInputDto } from "./dto/create-teacher-assignment-input.dto";
import { InviteTeacherLoginDto } from "./dto/invite-teacher-login.dto";
import { UpdateTeacherDto } from "./dto/update-teacher.dto";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { RequirePermissions } from "../auth/decorators/require-permissions.decorator";
import type { AuthenticatedUser } from "../auth/types/authenticated-user";

@Controller("schools/:schoolId/teachers")
export class TeachersController {
  constructor(
    private readonly teachers: TeachersService,
    private readonly documents: DocumentsService,
  ) {}

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

  @RequirePermissions("teachers.view")
  @Get(":teacherId")
  getOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param("schoolId") schoolId: string,
    @Param("teacherId") teacherId: string,
  ) {
    return this.teachers.getOne(user, schoolId, teacherId);
  }

  @RequirePermissions("teachers.update")
  @Patch(":teacherId")
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param("schoolId") schoolId: string,
    @Param("teacherId") teacherId: string,
    @Body() dto: UpdateTeacherDto,
  ) {
    return this.teachers.update(user, schoolId, teacherId, dto);
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

  @RequirePermissions("teachers.update")
  @Post(":teacherId/invite-login")
  inviteLogin(
    @CurrentUser() user: AuthenticatedUser,
    @Param("schoolId") schoolId: string,
    @Param("teacherId") teacherId: string,
    @Body() dto: InviteTeacherLoginDto,
  ) {
    return this.teachers.inviteLogin(user, schoolId, teacherId, dto.email);
  }

  @RequirePermissions("teachers.update")
  @Post(":teacherId/photo")
  @UseInterceptors(FileInterceptor("photo", { limits: { fileSize: 5 * 1024 * 1024 } }))
  uploadPhoto(
    @CurrentUser() user: AuthenticatedUser,
    @Param("schoolId") schoolId: string,
    @Param("teacherId") teacherId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.documents.uploadTeacherPhoto(user, schoolId, teacherId, file);
  }

  @RequirePermissions("teachers.view")
  @Get(":teacherId/photo")
  getPhotoUrl(
    @CurrentUser() user: AuthenticatedUser,
    @Param("schoolId") schoolId: string,
    @Param("teacherId") teacherId: string,
  ) {
    return this.documents.getTeacherPhotoUrl(user, schoolId, teacherId);
  }

  @RequirePermissions("teachers.update")
  @Post(":teacherId/documents")
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: 10 * 1024 * 1024 } }))
  uploadDocument(
    @CurrentUser() user: AuthenticatedUser,
    @Param("schoolId") schoolId: string,
    @Param("teacherId") teacherId: string,
    @UploadedFile() file: Express.Multer.File,
    @Body("label") label?: string,
  ) {
    return this.documents.uploadTeacherDocument(user, schoolId, teacherId, file, label);
  }

  @RequirePermissions("teachers.view")
  @Get(":teacherId/documents")
  listDocuments(
    @CurrentUser() user: AuthenticatedUser,
    @Param("schoolId") schoolId: string,
    @Param("teacherId") teacherId: string,
  ) {
    return this.documents.listTeacherDocuments(user, schoolId, teacherId);
  }
}
