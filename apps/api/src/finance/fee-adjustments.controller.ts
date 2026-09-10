import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import { FeeAdjustmentsService } from "./fee-adjustments.service";
import { CreateFeeAdjustmentDto } from "./dto/create-fee-adjustment.dto";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { RequirePermissions } from "../auth/decorators/require-permissions.decorator";
import type { AuthenticatedUser } from "../auth/types/authenticated-user";

@Controller("schools/:schoolId/fee-adjustments")
export class FeeAdjustmentsController {
  constructor(private readonly feeAdjustments: FeeAdjustmentsService) {}

  @RequirePermissions("finance.adjustments.manage")
  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Param("schoolId") schoolId: string,
    @Query("enrollmentId") enrollmentId?: string,
  ) {
    return this.feeAdjustments.listForSchool(user, schoolId, enrollmentId);
  }

  @RequirePermissions("finance.adjustments.manage")
  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param("schoolId") schoolId: string,
    @Body() dto: CreateFeeAdjustmentDto,
  ) {
    return this.feeAdjustments.create(user, schoolId, dto);
  }
}
