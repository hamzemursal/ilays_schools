import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import { PayslipsService } from "./payslips.service";
import { CreatePayslipDto } from "./dto/create-payslip.dto";
import { AddPayslipLineItemDto } from "./dto/add-payslip-line-item.dto";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { RequirePermissions } from "../auth/decorators/require-permissions.decorator";
import type { AuthenticatedUser } from "../auth/types/authenticated-user";

@Controller("schools/:schoolId")
export class PayslipsController {
  constructor(private readonly payslips: PayslipsService) {}

  @RequirePermissions("payroll.view")
  @Get("payslips")
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Param("schoolId") schoolId: string,
    @Query("payrollPeriodId") payrollPeriodId?: string,
    @Query("status") status?: string,
  ) {
    return this.payslips.listForSchool(user, schoolId, payrollPeriodId, status);
  }

  @RequirePermissions("payroll.view")
  @Get("payslips/:id")
  getOne(@CurrentUser() user: AuthenticatedUser, @Param("schoolId") schoolId: string, @Param("id") id: string) {
    return this.payslips.getOne(user, schoolId, id);
  }

  @RequirePermissions("payroll.prepare")
  @Post("payroll-periods/:payrollPeriodId/payslips")
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param("schoolId") schoolId: string,
    @Param("payrollPeriodId") payrollPeriodId: string,
    @Body() dto: CreatePayslipDto,
  ) {
    return this.payslips.create(user, schoolId, payrollPeriodId, dto);
  }

  @RequirePermissions("payroll.prepare")
  @Post("payslips/:id/line-items")
  addLineItem(
    @CurrentUser() user: AuthenticatedUser,
    @Param("schoolId") schoolId: string,
    @Param("id") id: string,
    @Body() dto: AddPayslipLineItemDto,
  ) {
    return this.payslips.addLineItem(user, schoolId, id, dto);
  }

  @RequirePermissions("payroll.prepare")
  @Post("payslips/:id/calculate")
  calculate(@CurrentUser() user: AuthenticatedUser, @Param("schoolId") schoolId: string, @Param("id") id: string) {
    return this.payslips.calculate(user, schoolId, id);
  }

  @RequirePermissions("payroll.review")
  @Post("payslips/:id/review")
  review(@CurrentUser() user: AuthenticatedUser, @Param("schoolId") schoolId: string, @Param("id") id: string) {
    return this.payslips.review(user, schoolId, id);
  }

  @RequirePermissions("payroll.approve")
  @Post("payslips/:id/approve")
  approve(@CurrentUser() user: AuthenticatedUser, @Param("schoolId") schoolId: string, @Param("id") id: string) {
    return this.payslips.approve(user, schoolId, id);
  }

  @RequirePermissions("payroll.pay")
  @Post("payslips/:id/pay")
  pay(@CurrentUser() user: AuthenticatedUser, @Param("schoolId") schoolId: string, @Param("id") id: string) {
    return this.payslips.pay(user, schoolId, id);
  }
}
