import { Body, Controller, Param, Post } from "@nestjs/common";
import { PaymentsService } from "./payments.service";
import { ReversePaymentDto } from "./dto/reverse-payment.dto";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { RequirePermissions } from "../auth/decorators/require-permissions.decorator";
import type { AuthenticatedUser } from "../auth/types/authenticated-user";

@Controller("payments")
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @RequirePermissions("finance.payments.reverse")
  @Post(":id/reverse")
  reverse(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Body() dto: ReversePaymentDto) {
    return this.payments.reverse(user, id, dto);
  }
}
