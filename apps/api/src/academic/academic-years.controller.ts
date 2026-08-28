import { Body, Controller, Get, Param, Patch, Post } from "@nestjs/common";
import { AcademicYearsService } from "./academic-years.service";
import { CreateAcademicYearDto } from "./dto/create-academic-year.dto";
import { UpdateAcademicYearDto } from "./dto/update-academic-year.dto";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { RequirePermissions } from "../auth/decorators/require-permissions.decorator";
import type { AuthenticatedUser } from "../auth/types/authenticated-user";

@Controller("schools/:schoolId/academic-years")
export class AcademicYearsController {
  constructor(private readonly academicYears: AcademicYearsService) {}

  @RequirePermissions("academic.view")
  @Get()
  list(@CurrentUser() user: AuthenticatedUser, @Param("schoolId") schoolId: string) {
    return this.academicYears.list(user, schoolId);
  }

  @RequirePermissions("academic.manage")
  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param("schoolId") schoolId: string,
    @Body() dto: CreateAcademicYearDto,
  ) {
    return this.academicYears.create(user, schoolId, dto);
  }

  @RequirePermissions("academic.manage")
  @Patch(":id")
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param("schoolId") schoolId: string,
    @Param("id") id: string,
    @Body() dto: UpdateAcademicYearDto,
  ) {
    return this.academicYears.update(user, schoolId, id, dto);
  }
}
