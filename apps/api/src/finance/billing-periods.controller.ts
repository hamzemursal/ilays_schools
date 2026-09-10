import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import { BillingPeriodsService } from "./billing-periods.service";
import { CreateBillingPeriodDto } from "./dto/create-billing-period.dto";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { RequirePermissions } from "../auth/decorators/require-permissions.decorator";
import type { AuthenticatedUser } from "../auth/types/authenticated-user";

@Controller("schools/:schoolId/billing-periods")
export class BillingPeriodsController {
  constructor(private readonly billingPeriods: BillingPeriodsService) {}

  @RequirePermissions("fees.manage")
  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Param("schoolId") schoolId: string,
    @Query("academicYearId") academicYearId?: string,
  ) {
    return this.billingPeriods.listForSchool(user, schoolId, academicYearId);
  }

  @RequirePermissions("fees.manage")
  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param("schoolId") schoolId: string,
    @Body() dto: CreateBillingPeriodDto,
  ) {
    return this.billingPeriods.create(user, schoolId, dto);
  }
}
