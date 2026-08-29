import { Controller, Get, Param, Post, UploadedFile, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { DocumentsService } from "./documents.service";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { RequirePermissions } from "../auth/decorators/require-permissions.decorator";
import type { AuthenticatedUser } from "../auth/types/authenticated-user";

@Controller("students/:id/photo")
export class DocumentsController {
  constructor(private readonly documents: DocumentsService) {}

  @RequirePermissions("students.update")
  @Post()
  @UseInterceptors(FileInterceptor("photo", { limits: { fileSize: 5 * 1024 * 1024 } }))
  upload(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.documents.uploadStudentPhoto(user, id, file);
  }

  @RequirePermissions("students.view")
  @Get()
  getUrl(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return this.documents.getStudentPhotoUrl(user, id);
  }
}
