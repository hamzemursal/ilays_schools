import { Controller, Get } from "@nestjs/common";
import { TeachersService } from "./teachers.service";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import type { AuthenticatedUser } from "../auth/types/authenticated-user";

@Controller("teachers/me")
export class MyTeachingController {
  constructor(private readonly teachers: TeachersService) {}

  @Get("assignments")
  assignments(@CurrentUser() user: AuthenticatedUser) {
    return this.teachers.myAssignments(user);
  }
}
