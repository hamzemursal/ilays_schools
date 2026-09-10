import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { ExpenseCategoriesService } from "./expense-categories.service";
import { CreateExpenseCategoryDto } from "./dto/create-expense-category.dto";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { RequirePermissions } from "../auth/decorators/require-permissions.decorator";
import type { AuthenticatedUser } from "../auth/types/authenticated-user";

@Controller("schools/:schoolId/expense-categories")
export class ExpenseCategoriesController {
  constructor(private readonly expenseCategories: ExpenseCategoriesService) {}

  @RequirePermissions("expenses.view")
  @Get()
  list(@CurrentUser() user: AuthenticatedUser, @Param("schoolId") schoolId: string) {
    return this.expenseCategories.listForSchool(user, schoolId);
  }

  @RequirePermissions("expenses.create")
  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param("schoolId") schoolId: string,
    @Body() dto: CreateExpenseCategoryDto,
  ) {
    return this.expenseCategories.create(user, schoolId, dto);
  }
}
