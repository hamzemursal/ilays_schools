import type { AuthenticatedUser } from "../auth/types/authenticated-user";
import { AuditService } from "./audit.service";
import { PrismaService } from "../prisma/prisma.service";
import { SchoolsService } from "../schools/schools.service";
import { requestContextStorage } from "./request-context";

const ACTOR: AuthenticatedUser = {
  id: "user-1",
  email: "admin@example.com",
  organizationId: "org-1",
  roles: ["SCHOOL_ADMIN"],
  permissions: ["audit.view"],
  schoolIds: ["school-1"],
};

type MockPrisma = {
  auditLog: { create: jest.Mock; findMany: jest.Mock; count: jest.Mock; groupBy: jest.Mock };
  user: { findUnique: jest.Mock; findMany: jest.Mock };
};

function createMockPrisma(): MockPrisma {
  return {
    auditLog: { create: jest.fn().mockResolvedValue(undefined), findMany: jest.fn(), count: jest.fn(), groupBy: jest.fn() },
    user: { findUnique: jest.fn().mockResolvedValue(null), findMany: jest.fn().mockResolvedValue([]) },
  };
}

function createService(prisma: MockPrisma) {
  const schools = { findOneAccessibleOrThrow: jest.fn().mockResolvedValue(undefined) };
  const service = new AuditService(prisma as unknown as PrismaService, schools as unknown as SchoolsService);
  return { service, schools };
}

describe("AuditService.record", () => {
  let prisma: MockPrisma;
  let service: AuditService;

  beforeEach(() => {
    prisma = createMockPrisma();
    ({ service } = createService(prisma));
  });

  it("resolves organizationId from the actor when none is given explicitly", async () => {
    await service.record({ actor: ACTOR, action: "X", module: "M", resourceType: "R" });
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ organizationId: "org-1" }) }),
    );
  });

  it("stores actorUserId/email/roles snapshot from the actor", async () => {
    await service.record({ actor: ACTOR, action: "X", module: "M", resourceType: "R" });
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ actorUserId: "user-1", actorEmailSnapshot: "admin@example.com", actorRoleSnapshot: "SCHOOL_ADMIN" }),
      }),
    );
  });

  it("writes every actor field as null for a system-initiated event (actor: null)", async () => {
    await service.record({ actor: null, organizationId: "org-1", action: "X", module: "M", resourceType: "R" });
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ actorUserId: null, actorNameSnapshot: null, actorEmailSnapshot: null, actorRoleSnapshot: null }),
      }),
    );
  });

  it("resolves actorNameSnapshot from the linked Teacher/Guardian/Student profile, preferring Teacher first", async () => {
    prisma.user.findUnique.mockResolvedValue({
      teacher: { firstName: "Amran", lastName: "Hassan" },
      guardian: { firstName: "G", lastName: "Parent" },
      student: null,
    });
    await service.record({ actor: ACTOR, action: "X", module: "M", resourceType: "R" });
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ actorNameSnapshot: "Amran Hassan" }) }),
    );
  });

  it("resolves actorNameSnapshot as null when the actor has no linked profile at all", async () => {
    prisma.user.findUnique.mockResolvedValue({ teacher: null, guardian: null, student: null });
    await service.record({ actor: ACTOR, action: "X", module: "M", resourceType: "R" });
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ actorNameSnapshot: null }) }),
    );
  });

  it("defaults status SUCCESS and severity INFO when not given", async () => {
    await service.record({ actor: ACTOR, action: "X", module: "M", resourceType: "R" });
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "SUCCESS", severity: "INFO" }) }),
    );
  });

  it("leaves before/after as undefined (not written) when not provided, distinct from an explicit null", async () => {
    await service.record({ actor: ACTOR, action: "X", module: "M", resourceType: "R" });
    const data = prisma.auditLog.create.mock.calls[0][0].data;
    expect(data.before).toBeUndefined();
    expect(data.after).toBeUndefined();
  });

  it("pulls ipAddress/userAgent/requestId from the current AsyncLocalStorage request context when present", async () => {
    await requestContextStorage.run({ ipAddress: "1.2.3.4", userAgent: "TestAgent", requestId: "req_abc" }, async () => {
      await service.record({ actor: ACTOR, action: "X", module: "M", resourceType: "R" });
    });
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ ipAddress: "1.2.3.4", userAgent: "TestAgent", requestId: "req_abc" }) }),
    );
  });

  it("falls back to null ip/userAgent/requestId when called outside any request context", async () => {
    await service.record({ actor: ACTOR, action: "X", module: "M", resourceType: "R" });
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ ipAddress: null, userAgent: null, requestId: null }) }),
    );
  });

  it("writes to the passed-in transaction client instead of the default PrismaService when one is given", async () => {
    const tx = { auditLog: { create: jest.fn().mockResolvedValue(undefined) } };
    await service.record({ actor: ACTOR, action: "X", module: "M", resourceType: "R" }, tx as never);
    expect(tx.auditLog.create).toHaveBeenCalled();
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });

  it("still resolves the actor name via the default PrismaService even when writing to a tx client", async () => {
    const tx = { auditLog: { create: jest.fn().mockResolvedValue(undefined) } };
    prisma.user.findUnique.mockResolvedValue({ teacher: { firstName: "A", lastName: "B" }, guardian: null, student: null });
    await service.record({ actor: ACTOR, action: "X", module: "M", resourceType: "R" }, tx as never);
    expect(prisma.user.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "user-1" } }));
    expect(tx.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ actorNameSnapshot: "A B" }) }),
    );
  });
});

describe("AuditService.listForSchool", () => {
  let prisma: MockPrisma;
  let service: AuditService;

  beforeEach(() => {
    prisma = createMockPrisma();
    ({ service } = createService(prisma));
  });

  it("checks school access before listing", async () => {
    prisma.auditLog.findMany.mockResolvedValue([]);
    const { service: svc, schools } = createService(prisma);
    await svc.listForSchool(ACTOR, "school-1");
    expect(schools.findOneAccessibleOrThrow).toHaveBeenCalledWith(ACTOR, "school-1");
  });

  it("resolves each row's actorEmail via a live user lookup, '(system)' for a null actorUserId", async () => {
    prisma.auditLog.findMany.mockResolvedValue([
      { id: "log-1", actorUserId: "user-2" },
      { id: "log-2", actorUserId: null },
    ]);
    prisma.user.findMany.mockResolvedValue([{ id: "user-2", email: "other@example.com" }]);

    const result = await service.listForSchool(ACTOR, "school-1");

    expect(result[0].actorEmail).toBe("other@example.com");
    expect(result[1].actorEmail).toBe("(system)");
  });

  it("reports '(deleted user)' when the actorUserId no longer resolves to a real user", async () => {
    prisma.auditLog.findMany.mockResolvedValue([{ id: "log-1", actorUserId: "deleted-user" }]);
    prisma.user.findMany.mockResolvedValue([]);

    const result = await service.listForSchool(ACTOR, "school-1");

    expect(result[0].actorEmail).toBe("(deleted user)");
  });
});

describe("AuditService.list — filter scoping", () => {
  let prisma: MockPrisma;
  let service: AuditService;

  beforeEach(() => {
    prisma = createMockPrisma();
    ({ service } = createService(prisma));
    prisma.auditLog.count.mockResolvedValue(0);
    prisma.auditLog.groupBy.mockResolvedValue([]);
    prisma.auditLog.findMany.mockResolvedValue([]);
  });

  it("returns an empty result without querying anything when the actor has no organizationId", async () => {
    const orgLessActor = { ...ACTOR, organizationId: null };
    const result = await service.list(orgLessActor, {});
    expect(result.data).toEqual([]);
    expect(prisma.auditLog.findMany).not.toHaveBeenCalled();
  });

  it("checks access and scopes to an explicit schoolId filter when given", async () => {
    const { service: svc, schools } = createService(prisma);
    await svc.list(ACTOR, { schoolId: "school-1" });
    expect(schools.findOneAccessibleOrThrow).toHaveBeenCalledWith(ACTOR, "school-1");
    const where = prisma.auditLog.count.mock.calls[0][0].where;
    expect(where.schoolId).toBe("school-1");
  });

  it("scopes to the actor's own schoolIds when no explicit schoolId filter is given", async () => {
    await service.list(ACTOR, {});
    const where = prisma.auditLog.count.mock.calls[0][0].where;
    expect(where.schoolId).toEqual({ in: ["school-1"] });
  });

  it("omits the schoolId clause entirely for an org-wide actor with no schoolIds and no explicit filter", async () => {
    const orgWideActor = { ...ACTOR, schoolIds: [] };
    await service.list(orgWideActor, {});
    const where = prisma.auditLog.count.mock.calls[0][0].where;
    expect(where).not.toHaveProperty("schoolId");
  });

  it("builds an inclusive end-of-day dateTo bound, not midnight at its start", async () => {
    await service.list(ACTOR, { dateTo: "2028-01-15" });
    const where = prisma.auditLog.count.mock.calls[0][0].where;
    expect(where.createdAt.lte.getHours()).toBe(23);
    expect(where.createdAt.lte.getMinutes()).toBe(59);
  });

  it("computes successCount/failedCount from the status groupBy", async () => {
    prisma.auditLog.groupBy.mockResolvedValue([
      { status: "SUCCESS", _count: 8 },
      { status: "FAILURE", _count: 2 },
    ]);
    prisma.auditLog.count.mockResolvedValueOnce(10).mockResolvedValueOnce(1); // total, then criticalCount

    const result = await service.list(ACTOR, {});

    expect(result.summary).toEqual({ total: 10, successful: 8, failed: 2, critical: 1 });
  });

  it("falls back to a live user lookup only for rows missing an actorEmailSnapshot", async () => {
    prisma.auditLog.findMany.mockResolvedValue([
      { id: "log-1", actorUserId: "user-2", actorEmailSnapshot: null },
      { id: "log-2", actorUserId: "user-3", actorEmailSnapshot: "already@example.com" },
    ]);
    prisma.user.findMany.mockResolvedValue([{ id: "user-2", email: "resolved@example.com" }]);

    const result = await service.list(ACTOR, {});

    expect(prisma.user.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: { in: ["user-2"] } } }));
    expect(result.data[0].actorEmailSnapshot).toBe("resolved@example.com");
    expect(result.data[1].actorEmailSnapshot).toBe("already@example.com");
  });

  it("clamps pageSize to MAX_PAGE_SIZE (100) even when a larger value is requested", async () => {
    await service.list(ACTOR, { pageSize: 500 });
    expect(prisma.auditLog.findMany.mock.calls[0][0].take).toBe(100);
  });
});

describe("AuditService.listAllForExport", () => {
  it("returns an empty array for an actor with no organizationId, without querying", async () => {
    const prisma = createMockPrisma();
    const { service } = createService(prisma);
    const result = await service.listAllForExport({ ...ACTOR, organizationId: null }, {});
    expect(result).toEqual([]);
    expect(prisma.auditLog.findMany).not.toHaveBeenCalled();
  });

  it("caps the export at 50,000 rows and applies no pagination skip", async () => {
    const prisma = createMockPrisma();
    prisma.auditLog.findMany.mockResolvedValue([]);
    const { service } = createService(prisma);

    await service.listAllForExport(ACTOR, {});

    const args = prisma.auditLog.findMany.mock.calls[0][0];
    expect(args.take).toBe(50_000);
    expect(args).not.toHaveProperty("skip");
  });
});
