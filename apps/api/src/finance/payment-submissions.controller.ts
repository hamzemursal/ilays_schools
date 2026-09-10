import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import { PaymentSubmissionsService } from "./payment-submissions.service";
import {
  CreatePaymentSubmissionFromFinanceDto,
  RejectPaymentSubmissionDto,
  VerifyPaymentSubmissionDto,
} from "./dto/create-payment-submission.dto";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { RequirePermissions } from "../auth/decorators/require-permissions.decorator";
import type { AuthenticatedUser } from "../auth/types/authenticated-user";

@Controller("schools/:schoolId/payment-submissions")
export class PaymentSubmissionsController {
  constructor(private readonly paymentSubmissions: PaymentSubmissionsService) {}

  @RequirePermissions("finance.ledger.view")
  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Param("schoolId") schoolId: string,
    @Query("status") status?: string,
  ) {
    return this.paymentSubmissions.listForSchool(user, schoolId, status);
  }

  // Finance directly logging a ZAAD deposit it found in the school's own
  // merchant account, without any Parent Portal submission — see the
  // PaymentSubmission schema comment ("Parent Portal submission must NOT be
  // the only path").
  @RequirePermissions("finance.payments.verify")
  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param("schoolId") schoolId: string,
    @Body() dto: CreatePaymentSubmissionFromFinanceDto,
  ) {
    return this.paymentSubmissions.submitFromFinance(user, schoolId, dto.studentId, dto);
  }

  @RequirePermissions("finance.payments.verify")
  @Post(":id/verify")
  verify(
    @CurrentUser() user: AuthenticatedUser,
    @Param("schoolId") schoolId: string,
    @Param("id") id: string,
    @Body() dto: VerifyPaymentSubmissionDto,
  ) {
    return this.paymentSubmissions.verify(user, schoolId, id, dto);
  }

  @RequirePermissions("finance.payments.verify")
  @Post(":id/reject")
  reject(
    @CurrentUser() user: AuthenticatedUser,
    @Param("schoolId") schoolId: string,
    @Param("id") id: string,
    @Body() dto: RejectPaymentSubmissionDto,
  ) {
    return this.paymentSubmissions.reject(user, schoolId, id, dto);
  }
}
