import { Controller, Get, Param } from "@nestjs/common";
import { DocumentsService } from "./documents.service";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import type { AuthenticatedUser } from "../auth/types/authenticated-user";

// Lives in the documents module (not alongside GuardianPortalController) so
// GuardiansModule never needs to depend on DocumentsModule — DocumentsModule
// already depends on GuardiansModule for the ownership check itself.
@Controller("guardians/me/children/:studentId/photo")
export class GuardianChildPhotoController {
  constructor(private readonly documents: DocumentsService) {}

  @Get()
  get(@CurrentUser() user: AuthenticatedUser, @Param("studentId") studentId: string) {
    return this.documents.getChildPhotoUrl(user, studentId);
  }
}
