import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import { LeaveStatus } from "@school-erp/database";
import { LeaveRequestsService } from "./leave-requests.service";
import { CreateLeaveRequestDto } from "./dto/create-leave-request.dto";
import { RejectLeaveRequestDto } from "./dto/reject-leave-request.dto";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { RequirePermissions } from "../auth/decorators/require-permissions.decorator";
import type { AuthenticatedUser } from "../auth/types/authenticated-user";

@Controller("schools/:schoolId/leave-requests")
export class LeaveRequestsController {
  constructor(private readonly leaveRequests: LeaveRequestsService) {}

  @RequirePermissions("hr.leave.view")
  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Param("schoolId") schoolId: string,
    @Query("status") status?: LeaveStatus,
  ) {
    return this.leaveRequests.listForSchool(user, schoolId, status);
  }

  @RequirePermissions("hr.leave.manage")
  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param("schoolId") schoolId: string,
    @Body() dto: CreateLeaveRequestDto,
  ) {
    return this.leaveRequests.create(user, schoolId, dto);
  }

  @RequirePermissions("hr.leave.approve")
  @Post(":leaveRequestId/approve")
  approve(
    @CurrentUser() user: AuthenticatedUser,
    @Param("schoolId") schoolId: string,
    @Param("leaveRequestId") leaveRequestId: string,
  ) {
    return this.leaveRequests.approve(user, schoolId, leaveRequestId);
  }

  @RequirePermissions("hr.leave.approve")
  @Post(":leaveRequestId/reject")
  reject(
    @CurrentUser() user: AuthenticatedUser,
    @Param("schoolId") schoolId: string,
    @Param("leaveRequestId") leaveRequestId: string,
    @Body() dto: RejectLeaveRequestDto,
  ) {
    return this.leaveRequests.reject(user, schoolId, leaveRequestId, dto);
  }
}
