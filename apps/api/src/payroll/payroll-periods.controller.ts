import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { PayrollPeriodsService } from "./payroll-periods.service";
import { CreatePayrollPeriodDto } from "./dto/create-payroll-period.dto";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { RequirePermissions } from "../auth/decorators/require-permissions.decorator";
import type { AuthenticatedUser } from "../auth/types/authenticated-user";

@Controller("schools/:schoolId/payroll-periods")
export class PayrollPeriodsController {
  constructor(private readonly payrollPeriods: PayrollPeriodsService) {}

  @RequirePermissions("payroll.view")
  @Get()
  list(@CurrentUser() user: AuthenticatedUser, @Param("schoolId") schoolId: string) {
    return this.payrollPeriods.listForSchool(user, schoolId);
  }

  @RequirePermissions("payroll.prepare")
  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param("schoolId") schoolId: string,
    @Body() dto: CreatePayrollPeriodDto,
  ) {
    return this.payrollPeriods.create(user, schoolId, dto);
  }

  @RequirePermissions("payroll.approve")
  @Post(":id/close")
  close(@CurrentUser() user: AuthenticatedUser, @Param("schoolId") schoolId: string, @Param("id") id: string) {
    return this.payrollPeriods.close(user, schoolId, id);
  }
}
