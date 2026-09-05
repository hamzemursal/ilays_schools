import { Controller, Get } from "@nestjs/common";
import { ExamsService } from "./exams.service";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { RequirePermissions } from "../auth/decorators/require-permissions.decorator";
import type { AuthenticatedUser } from "../auth/types/authenticated-user";

// Separate from ExamsController (which is school-scoped, "schools/:schoolId/
// exams") because this one isn't scoped by URL at all — it's always "this
// teacher's own assignments", resolved server-side from their Teacher
// profile, the same "teachers/me"-style self-service shape as
// MyTeachingController.
@Controller("my-exams")
export class MyExamsController {
  constructor(private readonly exams: ExamsService) {}

  @RequirePermissions("results.enter")
  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.exams.listMyExams(user);
  }
}
