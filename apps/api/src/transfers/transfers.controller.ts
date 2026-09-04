import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import { TransfersService, type TransferListFilters } from "./transfers.service";
import { RequestTransferDto } from "./dto/request-transfer.dto";
import { ApproveTransferDto } from "./dto/approve-transfer.dto";
import { RejectTransferDto } from "./dto/reject-transfer.dto";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { RequirePermissions } from "../auth/decorators/require-permissions.decorator";
import type { AuthenticatedUser } from "../auth/types/authenticated-user";

interface TransferListQuery {
  schoolId?: string;
  direction?: "incoming" | "outgoing";
  originSchoolId?: string;
  destinationSchoolId?: string;
  status?: TransferListFilters["status"];
  academicYearId?: string;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
  page?: string;
  pageSize?: string;
}

function parseListFilters(query: TransferListQuery): TransferListFilters {
  return {
    schoolId: query.schoolId,
    direction: query.direction,
    originSchoolId: query.originSchoolId,
    destinationSchoolId: query.destinationSchoolId,
    status: query.status,
    academicYearId: query.academicYearId,
    dateFrom: query.dateFrom,
    dateTo: query.dateTo,
    search: query.search,
    page: query.page ? Number(query.page) : undefined,
    pageSize: query.pageSize ? Number(query.pageSize) : undefined,
  };
}

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
  reject(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Body() dto: RejectTransferDto) {
    return this.transfers.reject(user, id, dto);
  }

  @RequirePermissions("transfers.create")
  @Post("transfers/:id/cancel")
  cancel(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return this.transfers.cancel(user, id);
  }

  // Org-wide (Super Admin) equivalent of the per-school list below — same
  // "no schoolId means every school the actor can see" convention as
  // Audit Log / Student Lifecycle. A School Admin who calls this without a
  // schoolId is auto-scoped to their own school(s), never unrestricted.
  @RequirePermissions("transfers.create")
  @Get("transfers")
  listAll(@CurrentUser() user: AuthenticatedUser, @Query() query: TransferListQuery) {
    return this.transfers.list(user, parseListFilters(query));
  }

  @RequirePermissions("transfers.create")
  @Get("transfers/summary")
  getSummary(@CurrentUser() user: AuthenticatedUser, @Query("schoolId") schoolId?: string) {
    return this.transfers.getSummary(user, schoolId);
  }

  @RequirePermissions("transfers.create")
  @Get("schools/:schoolId/transfers")
  listForSchool(
    @CurrentUser() user: AuthenticatedUser,
    @Param("schoolId") schoolId: string,
    @Query() query: TransferListQuery,
  ) {
    return this.transfers.list(user, { ...parseListFilters(query), schoolId });
  }

  // Must come after "schools/:schoolId/transfers" and "transfers/summary" —
  // different path shapes, so there's no real ambiguity, but keeping detail
  // routes below list routes matches the convention used everywhere else.
  @RequirePermissions("transfers.create")
  @Get("transfers/:id")
  getOne(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return this.transfers.getOne(user, id);
  }
}
