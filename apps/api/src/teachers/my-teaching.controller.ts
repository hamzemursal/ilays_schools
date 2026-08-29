import { Body, Controller, Get, Param, Patch, Post, UploadedFile, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { TeachersService } from "./teachers.service";
import { DocumentsService } from "../documents/documents.service";
import { UpdateMyTeacherProfileDto } from "./dto/update-my-teacher-profile.dto";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import type { AuthenticatedUser } from "../auth/types/authenticated-user";

// A teacher acting on their own profile/classes — every route here is
// gated only by authentication (JwtAuthGuard, applied globally), never by
// an admin-level @RequirePermissions key. Authorization is instead "this
// resource belongs to the caller's own Teacher/TeacherAssignment row",
// enforced inside TeachersService/DocumentsService.
@Controller("teachers/me")
export class MyTeachingController {
  constructor(
    private readonly teachers: TeachersService,
    private readonly documents: DocumentsService,
  ) {}

  @Get()
  profile(@CurrentUser() user: AuthenticatedUser) {
    return this.teachers.myProfile(user);
  }

  @Patch()
  updateProfile(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpdateMyTeacherProfileDto) {
    return this.teachers.updateMyProfile(user, dto);
  }

  @Get("assignments")
  assignments(@CurrentUser() user: AuthenticatedUser) {
    return this.teachers.myAssignments(user);
  }

  @Get("assignments/:assignmentId/students")
  assignmentStudents(@CurrentUser() user: AuthenticatedUser, @Param("assignmentId") assignmentId: string) {
    return this.teachers.myAssignmentStudents(user, assignmentId);
  }

  @Post("photo")
  @UseInterceptors(FileInterceptor("photo", { limits: { fileSize: 5 * 1024 * 1024 } }))
  uploadPhoto(@CurrentUser() user: AuthenticatedUser, @UploadedFile() file: Express.Multer.File) {
    return this.documents.uploadMyPhoto(user, file);
  }

  @Get("photo")
  getPhotoUrl(@CurrentUser() user: AuthenticatedUser) {
    return this.documents.getMyPhotoUrl(user);
  }

  @Post("documents")
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: 10 * 1024 * 1024 } }))
  uploadDocument(
    @CurrentUser() user: AuthenticatedUser,
    @UploadedFile() file: Express.Multer.File,
    @Body("label") label?: string,
  ) {
    return this.documents.uploadMyDocument(user, file, label);
  }

  @Get("documents")
  listDocuments(@CurrentUser() user: AuthenticatedUser) {
    return this.documents.listMyDocuments(user);
  }
}
