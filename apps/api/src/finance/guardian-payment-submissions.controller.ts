import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { PaymentSubmissionsService } from "./payment-submissions.service";
import { CreatePaymentSubmissionDto } from "./dto/create-payment-submission.dto";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import type { AuthenticatedUser } from "../auth/types/authenticated-user";

// Lives in the finance module rather than the guardians module — same
// reasoning as GuardianChildPhotoController in the documents module: this
// module already imports GuardiansModule, so GuardiansModule importing back
// would be circular. Gated only by authentication (JwtAuthGuard), never an
// admin @RequirePermissions key — same idiom as every other guardians/me/*
// route; PaymentSubmissionsService.submitFromGuardian is what actually
// enforces this guardian can reach this specific child.
@Controller("guardians/me")
export class GuardianPaymentSubmissionsController {
  constructor(private readonly paymentSubmissions: PaymentSubmissionsService) {}

  @Post("children/:studentId/payment-submissions")
  submit(
    @CurrentUser() user: AuthenticatedUser,
    @Param("studentId") studentId: string,
    @Body() dto: CreatePaymentSubmissionDto,
  ) {
    return this.paymentSubmissions.submitFromGuardian(user, studentId, dto);
  }

  @Get("payment-submissions")
  myPaymentSubmissions(@CurrentUser() user: AuthenticatedUser) {
    return this.paymentSubmissions.listForGuardian(user);
  }
}
