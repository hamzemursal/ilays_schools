import { Controller, Delete, Param, Post, UploadedFile, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { DocumentsService } from "./documents.service";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { RequirePermissions } from "../auth/decorators/require-permissions.decorator";
import type { AuthenticatedUser } from "../auth/types/authenticated-user";

// Read side isn't here — every authenticated user's own schools (whatever
// role: admin, teacher, parent, student) already come back from
// GET /auth/me with a resolved logoUrl (see AuthController.me), so the
// header never needs a separate, differently-gated read endpoint just to
// show branding to non-admins.
@Controller("schools/:id/logo")
export class SchoolLogoController {
  constructor(private readonly documents: DocumentsService) {}

  @RequirePermissions("settings.manage")
  @Post()
  @UseInterceptors(FileInterceptor("logo", { limits: { fileSize: 5 * 1024 * 1024 } }))
  upload(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.documents.uploadSchoolLogo(user, id, file);
  }

  @RequirePermissions("settings.manage")
  @Delete()
  remove(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return this.documents.removeSchoolLogo(user, id);
  }
}
