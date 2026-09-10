import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import { ExpensesService } from "./expenses.service";
import { CreateExpenseDto, RejectExpenseDto } from "./dto/create-expense.dto";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { RequirePermissions } from "../auth/decorators/require-permissions.decorator";
import type { AuthenticatedUser } from "../auth/types/authenticated-user";

@Controller("schools/:schoolId/expenses")
export class ExpensesController {
  constructor(private readonly expenses: ExpensesService) {}

  @RequirePermissions("expenses.view")
  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Param("schoolId") schoolId: string,
    @Query("status") status?: string,
  ) {
    return this.expenses.listForSchool(user, schoolId, status);
  }

  @RequirePermissions("expenses.create")
  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Param("schoolId") schoolId: string, @Body() dto: CreateExpenseDto) {
    return this.expenses.create(user, schoolId, dto);
  }

  @RequirePermissions("expenses.approve")
  @Post(":id/approve")
  approve(@CurrentUser() user: AuthenticatedUser, @Param("schoolId") schoolId: string, @Param("id") id: string) {
    return this.expenses.approve(user, schoolId, id);
  }

  @RequirePermissions("expenses.approve")
  @Post(":id/reject")
  reject(
    @CurrentUser() user: AuthenticatedUser,
    @Param("schoolId") schoolId: string,
    @Param("id") id: string,
    @Body() dto: RejectExpenseDto,
  ) {
    return this.expenses.reject(user, schoolId, id, dto);
  }

  @RequirePermissions("expenses.approve")
  @Post(":id/mark-paid")
  markPaid(@CurrentUser() user: AuthenticatedUser, @Param("schoolId") schoolId: string, @Param("id") id: string) {
    return this.expenses.markPaid(user, schoolId, id);
  }
}
