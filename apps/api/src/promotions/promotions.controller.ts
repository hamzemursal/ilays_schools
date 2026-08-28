import { BadRequestException, Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import { PromotionsService } from "./promotions.service";
import { PromoteSectionDto } from "./dto/promote-section.dto";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { RequirePermissions } from "../auth/decorators/require-permissions.decorator";
import type { AuthenticatedUser } from "../auth/types/authenticated-user";

@Controller("schools/:schoolId/sections/:sectionId/promotion")
export class PromotionsController {
  constructor(private readonly promotions: PromotionsService) {}

  @RequirePermissions("promotions.execute")
  @Get("preview")
  preview(
    @CurrentUser() user: AuthenticatedUser,
    @Param("schoolId") schoolId: string,
    @Param("sectionId") sectionId: string,
    @Query("fromAcademicYearId") fromAcademicYearId?: string,
  ) {
    if (!fromAcademicYearId) throw new BadRequestException("fromAcademicYearId query param is required");
    return this.promotions.preview(user, schoolId, sectionId, fromAcademicYearId);
  }

  @RequirePermissions("promotions.execute")
  @Post("confirm")
  confirm(
    @CurrentUser() user: AuthenticatedUser,
    @Param("schoolId") schoolId: string,
    @Param("sectionId") sectionId: string,
    @Body() dto: PromoteSectionDto,
  ) {
    return this.promotions.confirm(user, schoolId, sectionId, dto);
  }
}
