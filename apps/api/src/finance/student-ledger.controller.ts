import { Controller, Get, Param } from "@nestjs/common";
import { StudentLedgerService } from "./student-ledger.service";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { RequirePermissions } from "../auth/decorators/require-permissions.decorator";
import type { AuthenticatedUser } from "../auth/types/authenticated-user";

@Controller("students/:id/ledger")
export class StudentLedgerController {
  constructor(private readonly ledger: StudentLedgerService) {}

  @RequirePermissions("finance.ledger.view")
  @Get()
  getLedger(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return this.ledger.getLedger(user, id);
  }
}
