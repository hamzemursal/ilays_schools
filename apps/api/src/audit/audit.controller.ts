import { Controller, Get, Param, Query, Res } from "@nestjs/common";
import type { Response } from "express";
import type { AuditSeverity, AuditStatus } from "@school-erp/database";
import { AuditService } from "./audit.service";
import { toCsv } from "../exports/csv.util";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { RequirePermissions } from "../auth/decorators/require-permissions.decorator";
import type { AuthenticatedUser } from "../auth/types/authenticated-user";

@Controller()
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  // Unchanged route — the existing per-school audit-log page still calls
  // this exact shape (a plain array, capped at 200). Left as-is.
  @RequirePermissions("audit.view")
  @Get("schools/:schoolId/audit-logs")
  listForSchool(
    @CurrentUser() user: AuthenticatedUser,
    @Param("schoolId") schoolId: string,
    @Query("action") action?: string,
  ) {
    return this.audit.listForSchool(user, schoolId, action);
  }

  // The new search/filter/paginate surface. No :schoolId in the path — a
  // School Admin is scoped to their own school(s) automatically (see
  // AuditService.list); a Super/Org Admin sees every school in their
  // organization and may narrow with ?schoolId=.
  @RequirePermissions("audit.view")
  @Get("audit-logs")
  list(@CurrentUser() user: AuthenticatedUser, @Query() query: AuditLogQuery) {
    return this.audit.list(user, parseFilters(query));
  }

  @RequirePermissions("exports.create")
  @Get("audit-logs/export")
  async export(@CurrentUser() user: AuthenticatedUser, @Query() query: AuditLogQuery, @Res() res: Response) {
    const rows = await this.audit.listAllForExport(user, parseFilters(query));
    const csv = toCsv(rows, [
      { header: "Date & Time", value: (r) => r.createdAt.toISOString() },
      { header: "Actor Name", value: (r) => r.actorNameSnapshot },
      { header: "Actor Email", value: (r) => r.actorEmailSnapshot },
      { header: "Actor Role", value: (r) => r.actorRoleSnapshot },
      { header: "Action", value: (r) => r.action },
      { header: "Module", value: (r) => r.module },
      { header: "Resource Type", value: (r) => r.resource },
      { header: "Resource ID", value: (r) => r.resourceId },
      { header: "Resource Name", value: (r) => r.resourceNameSnapshot },
      { header: "School ID", value: (r) => r.schoolId },
      { header: "Status", value: (r) => r.status },
      { header: "Severity", value: (r) => r.severity },
      { header: "Reason", value: (r) => r.reason },
      { header: "IP Address", value: (r) => r.ipAddress },
      { header: "Request ID", value: (r) => r.requestId },
    ]);
    res.set({
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="audit-log.csv"`,
    });
    res.send(csv);
  }
}

interface AuditLogQuery {
  schoolId?: string;
  actorUserId?: string;
  module?: string;
  action?: string;
  status?: string;
  severity?: string;
  resourceType?: string;
  search?: string;
  dateFrom?: string;
  dateTo?: string;
  page?: string;
  pageSize?: string;
  sortDir?: string;
}

const VALID_STATUSES: AuditStatus[] = ["SUCCESS", "FAILED", "DENIED"];
const VALID_SEVERITIES: AuditSeverity[] = ["INFO", "WARNING", "CRITICAL"];

// Query params arrive as strings (or are absent) — this is the one place
// that turns them into the typed, validated filter object AuditService
// expects, rejecting anything that isn't one of the real enum values
// rather than silently passing junk through to Prisma.
function parseFilters(query: AuditLogQuery) {
  const status = query.status && VALID_STATUSES.includes(query.status as AuditStatus) ? (query.status as AuditStatus) : undefined;
  const severity =
    query.severity && VALID_SEVERITIES.includes(query.severity as AuditSeverity) ? (query.severity as AuditSeverity) : undefined;

  return {
    schoolId: query.schoolId,
    actorUserId: query.actorUserId,
    module: query.module,
    action: query.action,
    status,
    severity,
    resourceType: query.resourceType,
    search: query.search,
    dateFrom: query.dateFrom,
    dateTo: query.dateTo,
    page: query.page ? Number(query.page) : undefined,
    pageSize: query.pageSize ? Number(query.pageSize) : undefined,
    sortDir: query.sortDir === "asc" ? ("asc" as const) : undefined,
  };
}
