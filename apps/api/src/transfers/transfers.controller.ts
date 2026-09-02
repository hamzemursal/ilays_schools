import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { TransfersService } from "./transfers.service";
import { RequestTransferDto } from "./dto/request-transfer.dto";
import { ApproveTransferDto } from "./dto/approve-transfer.dto";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { RequirePermissions } from "../auth/decorators/require-permissions.decorator";
import type { AuthenticatedUser } from "../auth/types/authenticated-user";

@Controller()
export class TransfersController {
  constructor(private readonly transfers: TransfersService) {}

  @RequirePermissions("transfers.create")
  @Post("students/:studentId/transfers")
  request(
    @CurrentUser() user: AuthenticatedUser,
    @Param("studentId") studentId: string,
    @Body() dto: RequestTransferDto,
  ) {
    return this.transfers.request(user, studentId, dto);
  }

  @RequirePermissions("transfers.approve")
  @Post("transfers/:id/approve")
  approve(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Body() dto: ApproveTransferDto) {
    return this.transfers.approve(user, id, dto);
  }

  @RequirePermissions("transfers.approve")
  @Post("transfers/:id/reject")
  reject(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return this.transfers.reject(user, id);
  }

  @RequirePermissions("transfers.create")
  @Post("transfers/:id/cancel")
  cancel(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return this.transfers.cancel(user, id);
  }

  @RequirePermissions("transfers.create")
  @Get("schools/:schoolId/transfers")
  listForSchool(@CurrentUser() user: AuthenticatedUser, @Param("schoolId") schoolId: string) {
    return this.transfers.listForSchool(user, schoolId);
  }

  // Must come after "schools/:schoolId/transfers" — different path shape
  // (this is single-segment under "transfers/", not nested under a school),
  // so there's no ambiguity, but keeping detail routes below the list route
  // matches the convention used everywhere else in this codebase.
  @RequirePermissions("transfers.create")
  @Get("transfers/:id")
  getOne(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return this.transfers.getOne(user, id);
  }
}
