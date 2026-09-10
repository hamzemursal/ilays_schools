import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import { ChargesService } from "./charges.service";
import { RecordPaymentDto } from "./dto/record-payment.dto";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { RequirePermissions } from "../auth/decorators/require-permissions.decorator";
import type { AuthenticatedUser } from "../auth/types/authenticated-user";

@Controller()
export class ChargesController {
  constructor(private readonly charges: ChargesService) {}

  @RequirePermissions("fees.manage")
  @Post("schools/:schoolId/fee-structures/:feeStructureId/billing-periods/:billingPeriodId/generate-charges")
  generate(
    @CurrentUser() user: AuthenticatedUser,
    @Param("schoolId") schoolId: string,
    @Param("feeStructureId") feeStructureId: string,
    @Param("billingPeriodId") billingPeriodId: string,
  ) {
    return this.charges.generateForFeeStructure(user, schoolId, feeStructureId, billingPeriodId);
  }

  @RequirePermissions("fees.manage")
  @Get("schools/:schoolId/charges")
  listForSchool(
    @CurrentUser() user: AuthenticatedUser,
    @Param("schoolId") schoolId: string,
    @Query("status") status?: string,
  ) {
    return this.charges.listForSchool(user, schoolId, status);
  }

  @RequirePermissions("payments.record")
  @Post("charges/:id/payments")
  recordPayment(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Body() dto: RecordPaymentDto) {
    return this.charges.recordPayment(user, id, dto);
  }

  @RequirePermissions("fees.manage")
  @Get("charges/:id/payments")
  listPayments(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return this.charges.listPayments(user, id);
  }
}
