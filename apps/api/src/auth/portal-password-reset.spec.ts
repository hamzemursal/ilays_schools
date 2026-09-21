import { ConflictException, ForbiddenException, NotFoundException } from "@nestjs/common";
import * as argon2 from "argon2";
import type { AuthenticatedUser } from "./types/authenticated-user";
import type { PrismaService } from "../prisma/prisma.service";
import type { SchoolsService } from "../schools/schools.service";
import type { AuditService } from "../audit/audit.service";
import type { StorageService } from "../storage/storage.service";
import { sanitizeForAudit } from "../audit/sanitize.util";
import { StudentsService } from "../students/students.service";
import { GuardiansService } from "../guardians/guardians.service";

// Portal password reset: operates ONLY on the existing login, never creates
// or re-links anything, keeps mustChangePassword enforced, and never writes
// a password anywhere but the (argon2id) hash column and the one-time response.

const SCHOOL_ID = "school-1";
const ORG_ID = "org-1";

const ADMIN: AuthenticatedUser = {
  id: "admin-1",
  email: "admin@example.com",
  organizationId: ORG_ID,
  roles: ["SCHOOL_ADMIN"],
  permissions: ["students.update", "guardians.manage"],
  schoolIds: [SCHOOL_ID],
};

// Every write a reset must NEVER perform. Asserted on each success path.
const FORBIDDEN_WRITES = [
  ["user", "create"],
  ["user", "upsert"],
  ["student", "create"],
  ["student", "update"],
  ["guardian", "create"],
  ["guardian", "update"],
  ["studentGuardian", "create"],
  ["studentGuardian", "update"],
  ["studentGuardian", "upsert"],
  ["userRole", "create"],
  ["userRole", "upsert"],
  ["userSchool", "create"],
  ["userSchool", "upsert"],
  ["studentEnrollment", "create"],
  ["studentEnrollment", "update"],
  ["invitation", "create"],
] as const;

function createPrisma() {
  const model = () => ({
    create: jest.fn(),
    update: jest.fn(),
    upsert: jest.fn(),
    updateMany: jest.fn(),
    findUnique: jest.fn(),
    findFirst: jest.fn(),
  });
  const prisma = {
    user: model(),
    student: model(),
    guardian: model(),
    studentGuardian: model(),
    userRole: model(),
    userSchool: model(),
    studentEnrollment: model(),
    invitation: model(),
    refreshToken: model(),
    $transaction: jest.fn(),
  };
  prisma.$transaction.mockImplementation((fn: (tx: unknown) => unknown) => fn(prisma));
  prisma.user.update.mockResolvedValue({});
  prisma.refreshToken.updateMany.mockResolvedValue({ count: 2 });
  prisma.invitation.updateMany.mockResolvedValue({ count: 0 });
  return prisma;
}
type Prisma = ReturnType<typeof createPrisma>;

function expectNoIdentityWrites(prisma: Prisma) {
  for (const [table, op] of FORBIDDEN_WRITES) {
    expect((prisma[table] as Record<string, jest.Mock>)[op]).not.toHaveBeenCalled();
  }
}

function auditPayload(audit: { record: jest.Mock }) {
  return JSON.stringify(audit.record.mock.calls);
}

const userRow = (roles: string[], overrides: Record<string, unknown> = {}) => ({
  id: "user-1",
  email: "login@example.com",
  organizationId: ORG_ID,
  status: "ACTIVE",
  roles: roles.map((name) => ({ role: { name } })),
  ...overrides,
});

describe("StudentsService.resetPortalPassword", () => {
  const student = (overrides: Record<string, unknown> = {}) => ({
    id: "student-1",
    organizationId: ORG_ID,
    userId: "user-1",
    firstName: "Hodan",
    lastName: "Ali",
    enrollments: [
      { id: "enr-old", schoolId: SCHOOL_ID, status: "PROMOTED", studentNumber: "STU-2026-00001", startDate: new Date("2026-01-01") },
      { id: "enr-now", schoolId: SCHOOL_ID, status: "ACTIVE", studentNumber: "STU-2027-00007", startDate: new Date("2027-01-01") },
    ],
    ...overrides,
  });

  function setup(studentRow = student(), user = userRow(["STUDENT"])) {
    const prisma = createPrisma();
    prisma.student.findUnique.mockResolvedValue(studentRow);
    prisma.user.findUnique.mockResolvedValue(user);
    const audit = { record: jest.fn().mockResolvedValue(undefined) };
    const service = new StudentsService(
      prisma as unknown as PrismaService,
      {} as unknown as SchoolsService,
      {} as unknown as GuardiansService,
      {} as unknown as StorageService,
      audit as unknown as AuditService,
    );
    return { prisma, audit, service };
  }

  it("resets the EXISTING login: new argon2id hash, mustChangePassword true, and returns the one-time password", async () => {
    const { prisma, service } = setup();

    const result = await service.resetPortalPassword(ADMIN, "student-1");

    expect(prisma.user.update).toHaveBeenCalledTimes(1);
    const args = prisma.user.update.mock.calls[0][0];
    expect(args.where).toEqual({ id: "user-1" });
    expect(args.data.mustChangePassword).toBe(true);
    expect(args.data.passwordHash).not.toBe(result.temporaryPassword);
    expect(args.data.passwordHash).toMatch(/^\$argon2id\$/);
    expect(await argon2.verify(args.data.passwordHash, result.temporaryPassword)).toBe(true);
    expect(result.temporaryPassword.length).toBeGreaterThanOrEqual(12);
  });

  it("returns the Login ID the student actually signs in with: the ACTIVE enrollment's student number", async () => {
    const { service } = setup();

    const result = await service.resetPortalPassword(ADMIN, "student-1");

    expect(result.loginId).toBe("STU-2027-00007");
  });

  it("never creates a user/student/guardian/role/school/link and never re-links Student.userId", async () => {
    const { prisma, service } = setup();

    await service.resetPortalPassword(ADMIN, "student-1");

    expectNoIdentityWrites(prisma);
  });

  it("revokes every live session and any pending invite link for that user only", async () => {
    const { prisma, service } = setup();

    await service.resetPortalPassword(ADMIN, "student-1");

    expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({ where: { userId: "user-1", revoked: false }, data: { revoked: true } });
    expect(prisma.invitation.updateMany).toHaveBeenCalledWith({ where: { userId: "user-1", status: "PENDING" }, data: { status: "REVOKED" } });
  });

  it("audits the reset with the actor and the student, and no password of any kind", async () => {
    const { audit, service } = setup();

    const { temporaryPassword } = await service.resetPortalPassword(ADMIN, "student-1");

    expect(audit.record).toHaveBeenCalledTimes(1);
    expect(audit.record.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        actor: ADMIN,
        action: "STUDENT_PORTAL_PASSWORD_RESET",
        resourceType: "Student",
        resourceId: "student-1",
        after: { mustChangePassword: true, sessionsRevoked: 2 },
      }),
    );
    const payload = auditPayload(audit);
    expect(payload).not.toContain(temporaryPassword);
    expect(payload).not.toMatch(/argon2/);
    expect(payload).not.toMatch(/passwordHash/i);
  });

  it("a student with no portal account is refused — reset never creates one", async () => {
    const { prisma, service } = setup(student({ userId: null }));

    await expect(service.resetPortalPassword(ADMIN, "student-1")).rejects.toThrow("no portal account yet");
    expect(prisma.user.update).not.toHaveBeenCalled();
    expectNoIdentityWrites(prisma);
  });

  it("refuses a login that also holds another role (never resets a teacher/admin from here)", async () => {
    const { prisma, service } = setup(student(), userRow(["STUDENT", "SCHOOL_ADMIN"]));

    await expect(service.resetPortalPassword(ADMIN, "student-1")).rejects.toThrow(ForbiddenException);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it("refuses a login that is not a STUDENT at all", async () => {
    const { prisma, service } = setup(student(), userRow(["PARENT"]));

    await expect(service.resetPortalPassword(ADMIN, "student-1")).rejects.toThrow(ForbiddenException);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it("a suspended account is not silently reactivated", async () => {
    const { prisma, service } = setup(student(), userRow(["STUDENT"], { status: "SUSPENDED" }));

    await expect(service.resetPortalPassword(ADMIN, "student-1")).rejects.toThrow(ConflictException);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it("school isolation: a student of another organization or another school is NotFound", async () => {
    const otherOrg = setup(student({ organizationId: "org-2" }));
    await expect(otherOrg.service.resetPortalPassword(ADMIN, "student-1")).rejects.toThrow(NotFoundException);

    const otherSchool = setup(student({ enrollments: [{ id: "e", schoolId: "school-2", status: "ACTIVE", studentNumber: "X", startDate: new Date() }] }));
    await expect(otherSchool.service.resetPortalPassword(ADMIN, "student-1")).rejects.toThrow(NotFoundException);
    expect(otherSchool.prisma.user.update).not.toHaveBeenCalled();
  });

  it("a login whose user row belongs to another organization is NotFound", async () => {
    const { prisma, service } = setup(student(), userRow(["STUDENT"], { organizationId: "org-2" }));

    await expect(service.resetPortalPassword(ADMIN, "student-1")).rejects.toThrow(NotFoundException);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it("two resets in a row each work and each issue a different password for the same user", async () => {
    const { prisma, service } = setup();

    const first = await service.resetPortalPassword(ADMIN, "student-1");
    const second = await service.resetPortalPassword(ADMIN, "student-1");

    expect(first.temporaryPassword).not.toBe(second.temporaryPassword);
    expect(prisma.user.update.mock.calls.map((c) => c[0].where.id)).toEqual(["user-1", "user-1"]);
    expectNoIdentityWrites(prisma);
  });
});

describe("GuardiansService.resetPortalPassword", () => {
  const guardian = (overrides: Record<string, unknown> = {}) => ({
    id: "guardian-1",
    userId: "user-1",
    firstName: "Amina",
    lastName: "Ali",
    ...overrides,
  });

  function setup(guardianRow: Record<string, unknown> | null = guardian(), user = userRow(["PARENT"])) {
    const prisma = createPrisma();
    prisma.guardian.findFirst.mockResolvedValue(guardianRow);
    prisma.user.findUnique.mockResolvedValue(user);
    const audit = { record: jest.fn().mockResolvedValue(undefined) };
    const schools = { findOneAccessibleOrThrow: jest.fn().mockResolvedValue({ id: SCHOOL_ID, organizationId: ORG_ID }) };
    const service = new GuardiansService(
      prisma as unknown as PrismaService,
      schools as unknown as SchoolsService,
      audit as unknown as AuditService,
    );
    return { prisma, audit, schools, service };
  }

  it("resets the EXISTING parent login: hash, mustChangePassword true, sessions revoked, one-time password returned", async () => {
    const { prisma, service } = setup();

    const result = await service.resetPortalPassword(ADMIN, SCHOOL_ID, "guardian-1");

    expect(result.email).toBe("login@example.com");
    const args = prisma.user.update.mock.calls[0][0];
    expect(args.where).toEqual({ id: "user-1" });
    expect(args.data.mustChangePassword).toBe(true);
    expect(await argon2.verify(args.data.passwordHash, result.temporaryPassword)).toBe(true);
    expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({ where: { userId: "user-1", revoked: false }, data: { revoked: true } });
  });

  it("never creates a user/guardian/student/role/school link or student-parent link, and never re-links Guardian.userId", async () => {
    const { prisma, service } = setup();

    await service.resetPortalPassword(ADMIN, SCHOOL_ID, "guardian-1");

    expectNoIdentityWrites(prisma);
  });

  it("a parent who never finished invite setup becomes ACTIVE with the reset, and their old invite link is revoked", async () => {
    const { prisma, service } = setup(guardian(), userRow(["PARENT"], { status: "PENDING_SETUP" }));

    await service.resetPortalPassword(ADMIN, SCHOOL_ID, "guardian-1");

    expect(prisma.user.update.mock.calls[0][0].data.status).toBe("ACTIVE");
    expect(prisma.invitation.updateMany).toHaveBeenCalledWith({ where: { userId: "user-1", status: "PENDING" }, data: { status: "REVOKED" } });
  });

  it("audits with the actor and guardian, and no password of any kind", async () => {
    const { audit, service } = setup();

    const { temporaryPassword } = await service.resetPortalPassword(ADMIN, SCHOOL_ID, "guardian-1");

    expect(audit.record.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        actor: ADMIN,
        action: "PARENT_PORTAL_PASSWORD_RESET",
        resourceType: "Guardian",
        resourceId: "guardian-1",
        after: { mustChangePassword: true, sessionsRevoked: 2 },
      }),
    );
    expect(auditPayload(audit)).not.toContain(temporaryPassword);
    expect(auditPayload(audit)).not.toMatch(/passwordHash|argon2/i);
  });

  it("a parent with no portal account is refused — reset never creates one", async () => {
    const { prisma, service } = setup(guardian({ userId: null }));

    await expect(service.resetPortalPassword(ADMIN, SCHOOL_ID, "guardian-1")).rejects.toThrow("no portal account yet");
    expect(prisma.user.update).not.toHaveBeenCalled();
    expectNoIdentityWrites(prisma);
  });

  it("a parent not reachable in this school is NotFound", async () => {
    const { prisma, service } = setup(null);

    await expect(service.resetPortalPassword(ADMIN, SCHOOL_ID, "guardian-9")).rejects.toThrow(NotFoundException);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it("checks the school gate first", async () => {
    const { schools, service } = setup();

    await service.resetPortalPassword(ADMIN, SCHOOL_ID, "guardian-1");

    expect(schools.findOneAccessibleOrThrow).toHaveBeenCalledWith(ADMIN, SCHOOL_ID);
  });

  it("refuses a parent whose login is really a teacher/admin account (multi-role) or another role entirely", async () => {
    const teacherToo = setup(guardian(), userRow(["PARENT", "TEACHER"]));
    await expect(teacherToo.service.resetPortalPassword(ADMIN, SCHOOL_ID, "guardian-1")).rejects.toThrow(ForbiddenException);
    expect(teacherToo.prisma.user.update).not.toHaveBeenCalled();

    const notParent = setup(guardian(), userRow(["SUPER_ADMIN"]));
    await expect(notParent.service.resetPortalPassword(ADMIN, SCHOOL_ID, "guardian-1")).rejects.toThrow(ForbiddenException);
    expect(notParent.prisma.user.update).not.toHaveBeenCalled();
  });

  it("a suspended parent account is not silently reactivated", async () => {
    const { prisma, service } = setup(guardian(), userRow(["PARENT"], { status: "SUSPENDED" }));

    await expect(service.resetPortalPassword(ADMIN, SCHOOL_ID, "guardian-1")).rejects.toThrow(ConflictException);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });
});

describe("Audit log defense in depth", () => {
  it("even if a password field were ever passed to an audit entry, it is redacted", () => {
    const sanitized = sanitizeForAudit({ temporaryPassword: "Zk3-secret", newPassword: "x", passwordHash: "$argon2id$..." });

    expect(JSON.stringify(sanitized)).not.toContain("Zk3-secret");
    expect(JSON.stringify(sanitized)).not.toContain("argon2id");
  });
});

describe("A temporary password is never written to any log", () => {
  it("neither a student reset nor a parent reset writes it to the console, stdout or stderr", async () => {
    const seen: string[] = [];
    const capture = (...args: unknown[]) => void seen.push(args.map(String).join(" "));
    const spies = (["log", "info", "warn", "error", "debug"] as const).map((m) => jest.spyOn(console, m).mockImplementation(capture));
    const out = jest.spyOn(process.stdout, "write").mockImplementation((chunk: unknown) => (capture(chunk), true));
    const err = jest.spyOn(process.stderr, "write").mockImplementation((chunk: unknown) => (capture(chunk), true));
    try {
      const studentPrisma = createPrisma();
      studentPrisma.student.findUnique.mockResolvedValue({
        id: "student-1", organizationId: ORG_ID, userId: "user-1", firstName: "Hodan", lastName: "Ali",
        enrollments: [{ id: "e", schoolId: SCHOOL_ID, status: "ACTIVE", studentNumber: "STU-1", startDate: new Date("2027-01-01") }],
      });
      studentPrisma.user.findUnique.mockResolvedValue(userRow(["STUDENT"]));
      const students = new StudentsService(
        studentPrisma as unknown as PrismaService, {} as unknown as SchoolsService, {} as unknown as GuardiansService,
        {} as unknown as StorageService, { record: jest.fn() } as unknown as AuditService,
      );
      const s = await students.resetPortalPassword(ADMIN, "student-1");

      const parentPrisma = createPrisma();
      parentPrisma.guardian.findFirst.mockResolvedValue({ id: "g", userId: "user-1", firstName: "Amina", lastName: "Ali" });
      parentPrisma.user.findUnique.mockResolvedValue(userRow(["PARENT"]));
      const guardians = new GuardiansService(
        parentPrisma as unknown as PrismaService,
        { findOneAccessibleOrThrow: jest.fn().mockResolvedValue({ id: SCHOOL_ID, organizationId: ORG_ID }) } as unknown as SchoolsService,
        { record: jest.fn() } as unknown as AuditService,
      );
      const p = await guardians.resetPortalPassword(ADMIN, SCHOOL_ID, "g");

      const everything = seen.join("\n");
      expect(everything).not.toContain(s.temporaryPassword);
      expect(everything).not.toContain(p.temporaryPassword);
    } finally {
      spies.forEach((spy) => spy.mockRestore());
      out.mockRestore();
      err.mockRestore();
    }
  });
});
