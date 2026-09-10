import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import { SalaryHistoryService } from "./salary-history.service";
import { CreateSalaryHistoryDto } from "./dto/create-salary-history.dto";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { RequirePermissions } from "../auth/decorators/require-permissions.decorator";
import type { AuthenticatedUser } from "../auth/types/authenticated-user";

@Controller("schools/:schoolId/salary-history")
export class SalaryHistoryController {
  constructor(private readonly salaryHistory: SalaryHistoryService) {}

  @RequirePermissions("payroll.view")
  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Param("schoolId") schoolId: string,
    @Query("teacherId") teacherId?: string,
    @Query("staffId") staffId?: string,
  ) {
    return this.salaryHistory.listForEmployee(user, schoolId, teacherId, staffId);
  }

  @RequirePermissions("payroll.prepare")
  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param("schoolId") schoolId: string,
    @Body() dto: CreateSalaryHistoryDto,
  ) {
    return this.salaryHistory.create(user, schoolId, dto);
  }
}
