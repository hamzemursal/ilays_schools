import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import { InvoicesService } from "./invoices.service";
import { RecordPaymentDto } from "./dto/record-payment.dto";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { RequirePermissions } from "../auth/decorators/require-permissions.decorator";
import type { AuthenticatedUser } from "../auth/types/authenticated-user";

@Controller()
export class InvoicesController {
  constructor(private readonly invoices: InvoicesService) {}

  @RequirePermissions("fees.manage")
  @Post("schools/:schoolId/fee-structures/:feeStructureId/generate-invoices")
  generate(
    @CurrentUser() user: AuthenticatedUser,
    @Param("schoolId") schoolId: string,
    @Param("feeStructureId") feeStructureId: string,
  ) {
    return this.invoices.generateForFeeStructure(user, schoolId, feeStructureId);
  }

  @RequirePermissions("fees.manage")
  @Get("schools/:schoolId/invoices")
  listForSchool(
    @CurrentUser() user: AuthenticatedUser,
    @Param("schoolId") schoolId: string,
    @Query("status") status?: string,
  ) {
    return this.invoices.listForSchool(user, schoolId, status);
  }

  @RequirePermissions("fees.manage")
  @Get("students/:id/invoices")
  listForStudent(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return this.invoices.listForStudent(user, id);
  }

  @RequirePermissions("payments.record")
  @Post("invoices/:id/payments")
  recordPayment(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Body() dto: RecordPaymentDto,
  ) {
    return this.invoices.recordPayment(user, id, dto);
  }

  @RequirePermissions("fees.manage")
  @Get("invoices/:id/payments")
  listPayments(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return this.invoices.listPayments(user, id);
  }
}
