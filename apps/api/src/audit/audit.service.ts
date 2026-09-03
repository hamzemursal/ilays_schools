import { forwardRef, Inject, Injectable } from "@nestjs/common";
import type { AuditSeverity, AuditStatus, Prisma } from "@school-erp/database";
import { PrismaService } from "../prisma/prisma.service";
import { SchoolsService } from "../schools/schools.service";
import type { AuthenticatedUser } from "../auth/types/authenticated-user";
import { requestContextStorage } from "./request-context";
import { sanitizeForAudit } from "./sanitize.util";

type AuditClient = PrismaService | Prisma.TransactionClient;

export interface RecordAuditParams {
  // null actor = a system-initiated event with no human behind it (none
  // exist yet in this codebase, but the shape supports one without a
  // special case later).
  actor: AuthenticatedUser | null;
  organizationId?: string | null;
  schoolId?: string | null;
  action: string;
  module: string;
  resourceType: string;
  resourceId?: string | null;
  resourceName?: string | null;
  status?: AuditStatus;
  severity?: AuditSeverity;
  before?: unknown;
  after?: unknown;
  reason?: string | null;
}

export interface AuditLogFilters {
  schoolId?: string;
  actorUserId?: string;
  module?: string;
  action?: string;
  status?: AuditStatus;
  severity?: AuditSeverity;
  resourceType?: string;
  search?: string;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  pageSize?: number;
  sortDir?: "asc" | "desc";
}

const MAX_PAGE_SIZE = 100;

@Injectable()
export class AuditService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => SchoolsService)) private readonly schools: SchoolsService,
  ) {}

  // The one place any part of the app creates an audit row. Resolves the
  // actor's current name/email/role into snapshot columns at write time
  // (see schema comment on AuditLog) and fills IP/user-agent/requestId from
  // the current request's AsyncLocalStorage context (see request-context.ts)
  // when the caller doesn't pass them explicitly — which is every caller
  // today, since threading a Request object through every service method
  // that might audit something isn't worth the churn this would cause.
  //
  // `client` defaults to the plain PrismaService but accepts a `tx` from an
  // ongoing $transaction so the audit row commits or rolls back atomically
  // with the business change it's recording, exactly like every existing
  // audit call site already does.
  async record(params: RecordAuditParams, client: AuditClient = this.prisma): Promise<void> {
    const ctx = requestContextStorage.getStore();
    // Deliberately resolved via this.prisma, never the passed-in `client` —
    // when `client` is a `tx` from an ongoing transaction, this lookup has
    // nothing to do with that transaction's own consistency (it's just
    // "does this already-existing user have a Teacher/Guardian/Student
    // profile"), and running it on a separate connection keeps it off that
    // transaction's time budget. A long multi-step delete transaction
    // (e.g. AcademicYearsService.remove) is already close to Prisma's
    // default 5s interactive-transaction timeout; one more query inside it
    // was enough to tip it over in testing.
    const actorName = params.actor ? await this.resolveActorName(params.actor) : null;

    await client.auditLog.create({
      data: {
        organizationId: params.organizationId ?? params.actor?.organizationId ?? null,
        schoolId: params.schoolId ?? null,
        actorUserId: params.actor?.id ?? null,
        actorNameSnapshot: actorName,
        actorEmailSnapshot: params.actor?.email ?? null,
        actorRoleSnapshot: params.actor && params.actor.roles.length > 0 ? params.actor.roles.join(", ") : null,
        action: params.action,
        module: params.module,
        resource: params.resourceType,
        resourceId: params.resourceId ?? null,
        resourceNameSnapshot: params.resourceName ?? null,
        status: params.status ?? "SUCCESS",
        severity: params.severity ?? "INFO",
        before: params.before !== undefined ? (sanitizeForAudit(params.before) as Prisma.InputJsonValue) : undefined,
        after: params.after !== undefined ? (sanitizeForAudit(params.after) as Prisma.InputJsonValue) : undefined,
        reason: params.reason ?? null,
        ipAddress: ctx?.ipAddress ?? null,
        userAgent: ctx?.userAgent ?? null,
        requestId: ctx?.requestId ?? null,
      },
    });
  }

  private async resolveActorName(actor: AuthenticatedUser): Promise<string | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: actor.id },
      select: {
        teacher: { select: { firstName: true, lastName: true } },
        guardian: { select: { firstName: true, lastName: true } },
        student: { select: { firstName: true, lastName: true } },
      },
    });
    const profile = user?.teacher ?? user?.guardian ?? user?.student;
    return profile ? `${profile.firstName} ${profile.lastName}` : null;
  }

  // Unchanged from before this feature — the existing per-school audit-log
  // page still calls this exact route/shape. Left in place deliberately so
  // that page keeps working without modification until it's replaced.
  async listForSchool(actor: AuthenticatedUser, schoolId: string, action?: string) {
    await this.schools.findOneAccessibleOrThrow(actor, schoolId);

    const logs = await this.prisma.auditLog.findMany({
      where: { schoolId, ...(action ? { action } : {}) },
      orderBy: { createdAt: "desc" },
      take: 200,
    });

    const actorIds = [...new Set(logs.map((l) => l.actorUserId).filter((id): id is string => !!id))];
    const users = await this.prisma.user.findMany({
      where: { id: { in: actorIds } },
      select: { id: true, email: true },
    });
    const emailById = new Map(users.map((u) => [u.id, u.email]));

    return logs.map((l) => ({
      ...l,
      actorEmail: l.actorUserId ? (emailById.get(l.actorUserId) ?? "(deleted user)") : "(system)",
    }));
  }

  // The professional search/filter/paginate surface. A School Admin's scope
  // is always intersected with their real accessible schools server-side —
  // a `schoolId` filter for a school outside that scope is rejected with
  // the same NotFoundException findOneAccessibleOrThrow already uses
  // everywhere else, never silently satisfied with someone else's data.
  async list(actor: AuthenticatedUser, filters: AuditLogFilters) {
    if (!actor.organizationId) {
      return this.emptyResult(filters);
    }

    const where = await this.buildWhere(actor, filters);

    const page = Math.max(1, filters.page ?? 1);
    const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, filters.pageSize ?? 25));
    const sortDir = filters.sortDir ?? "desc";

    const [total, statusGroups, criticalCount, rows] = await Promise.all([
      this.prisma.auditLog.count({ where }),
      this.prisma.auditLog.groupBy({ by: ["status"], where, _count: true }),
      this.prisma.auditLog.count({ where: { ...where, severity: "CRITICAL" } }),
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: sortDir },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    // Legacy rows created before this feature have no snapshot yet — fall
    // back to a live lookup for just those, exactly like the old
    // listForSchool always did for every row. This never grows: every row
    // created from here on always carries its own snapshot.
    const missingSnapshotIds = [
      ...new Set(rows.filter((r) => !r.actorEmailSnapshot && r.actorUserId).map((r) => r.actorUserId!)),
    ];
    const fallbackUsers =
      missingSnapshotIds.length > 0
        ? await this.prisma.user.findMany({ where: { id: { in: missingSnapshotIds } }, select: { id: true, email: true } })
        : [];
    const fallbackEmailById = new Map(fallbackUsers.map((u) => [u.id, u.email]));

    const successCount = statusGroups.find((g) => g.status === "SUCCESS")?._count ?? 0;
    const failedCount = statusGroups.reduce((sum, g) => (g.status !== "SUCCESS" ? sum + g._count : sum), 0);

    return {
      data: rows.map((r) => ({
        ...r,
        actorEmailSnapshot: r.actorEmailSnapshot ?? (r.actorUserId ? (fallbackEmailById.get(r.actorUserId) ?? null) : null),
      })),
      pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
      summary: { total, successful: successCount, failed: failedCount, critical: criticalCount },
    };
  }

  // CSV export — same filters as list(), no pagination, hard-capped so a
  // deliberately unfiltered export on a very old organization can't try to
  // stream millions of rows in one response. 50,000 rows is generous for an
  // actual "export what I'm looking at" use case; the UI should nudge
  // toward narrower filters well before that.
  async listAllForExport(actor: AuthenticatedUser, filters: AuditLogFilters) {
    if (!actor.organizationId) return [];
    const where = await this.buildWhere(actor, filters);
    return this.prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: filters.sortDir ?? "desc" },
      take: 50_000,
    });
  }

  private async buildWhere(actor: AuthenticatedUser, filters: AuditLogFilters): Promise<Prisma.AuditLogWhereInput> {
    let schoolIdClause: Prisma.AuditLogWhereInput["schoolId"];
    if (filters.schoolId) {
      // Throws NotFoundException if this school isn't actually accessible
      // to the actor — reuses the exact ownership check every other
      // school-scoped endpoint in the app already relies on.
      await this.schools.findOneAccessibleOrThrow(actor, filters.schoolId);
      schoolIdClause = filters.schoolId;
    } else if (actor.schoolIds.length > 0) {
      schoolIdClause = { in: actor.schoolIds };
    }

    return {
      organizationId: actor.organizationId,
      ...(schoolIdClause !== undefined ? { schoolId: schoolIdClause } : {}),
      ...(filters.actorUserId ? { actorUserId: filters.actorUserId } : {}),
      ...(filters.module ? { module: filters.module } : {}),
      ...(filters.action ? { action: filters.action } : {}),
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.severity ? { severity: filters.severity } : {}),
      ...(filters.resourceType ? { resource: filters.resourceType } : {}),
      ...(filters.dateFrom || filters.dateTo
        ? {
            createdAt: {
              ...(filters.dateFrom ? { gte: new Date(filters.dateFrom) } : {}),
              ...(filters.dateTo ? { lte: endOfDay(filters.dateTo) } : {}),
            },
          }
        : {}),
      ...(filters.search
        ? {
            OR: [
              { actorNameSnapshot: { contains: filters.search, mode: "insensitive" } },
              { actorEmailSnapshot: { contains: filters.search, mode: "insensitive" } },
              { resourceNameSnapshot: { contains: filters.search, mode: "insensitive" } },
              { resourceId: { contains: filters.search, mode: "insensitive" } },
              { action: { contains: filters.search, mode: "insensitive" } },
              { module: { contains: filters.search, mode: "insensitive" } },
              { requestId: { contains: filters.search, mode: "insensitive" } },
            ],
          }
        : {}),
    };
  }

  private emptyResult(filters: AuditLogFilters) {
    const page = Math.max(1, filters.page ?? 1);
    const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, filters.pageSize ?? 25));
    return {
      data: [],
      pagination: { page, pageSize, total: 0, totalPages: 1 },
      summary: { total: 0, successful: 0, failed: 0, critical: 0 },
    };
  }
}

// Inclusive end-of-day bound for a plain "YYYY-MM-DD" dateTo filter — a UI
// date range picker means "through the end of that day," not midnight at
// its start, which `new Date(dateTo)` alone would give.
function endOfDay(dateStr: string): Date {
  const d = new Date(dateStr);
  d.setHours(23, 59, 59, 999);
  return d;
}
