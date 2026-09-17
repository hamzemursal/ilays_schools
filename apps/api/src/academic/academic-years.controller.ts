import { Body, Controller, Delete, Get, Param, Patch, Post } from "@nestjs/common";
import { AcademicYearsService } from "./academic-years.service";
import { CreateAcademicYearDto } from "./dto/create-academic-year.dto";
import { UpdateAcademicYearDto } from "./dto/update-academic-year.dto";
import { UpdateTermWeightsDto } from "./dto/update-term-weights.dto";
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

  // Backs the clean-URL "?year=" query param — resolves an identifier (a
  // real id, or the year's own name, e.g. "2027") to the real row. Same
  // "academic.view" gate as list() above.
  @RequirePermissions("academic.view")
  @Get("by-identifier/:identifier")
  resolveIdentifier(
    @CurrentUser() user: AuthenticatedUser,
    @Param("schoolId") schoolId: string,
    @Param("identifier") identifier: string,
  ) {
    return this.academicYears.resolveIdentifierOrThrow(user, schoolId, identifier);
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

  // The only write path for a Term — there is deliberately no create/delete
  // endpoint for terms, since a year always has exactly two (see Term's
  // schema comment). Both weights are required together and validated to
  // sum to 100 in the service.
  @RequirePermissions("academic.manage")
  @Patch(":id/term-weights")
  updateTermWeights(
    @CurrentUser() user: AuthenticatedUser,
    @Param("schoolId") schoolId: string,
    @Param("id") id: string,
    @Body() dto: UpdateTermWeightsDto,
  ) {
    return this.academicYears.updateTermWeights(user, schoolId, id, dto);
  }

  // Real counts of everything this year owns, shown to the admin before
  // they can even see the confirm-delete button — see
  // AcademicYearsService.getDeletionImpact for exactly what's counted.
  @RequirePermissions("academic.manage")
  @Get(":id/deletion-impact")
  getDeletionImpact(
    @CurrentUser() user: AuthenticatedUser,
    @Param("schoolId") schoolId: string,
    @Param("id") id: string,
  ) {
    return this.academicYears.getDeletionImpact(user, schoolId, id);
  }

  @RequirePermissions("academic.manage")
  @Delete(":id")
  remove(@CurrentUser() user: AuthenticatedUser, @Param("schoolId") schoolId: string, @Param("id") id: string) {
    return this.academicYears.remove(user, schoolId, id);
  }
}
