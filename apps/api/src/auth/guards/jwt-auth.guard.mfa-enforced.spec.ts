import { ExecutionContext, ForbiddenException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Reflector } from "@nestjs/core";
import { JwtAuthGuard } from "./jwt-auth.guard";
import { ALLOW_PASSWORD_CHANGE_REQUIRED_KEY } from "../decorators/allow-password-change-required.decorator";
import { ALLOW_TOTP_SETUP_REQUIRED_KEY } from "../decorators/allow-totp-setup-required.decorator";
import { PrismaService } from "../../prisma/prisma.service";

// Proves the ORIGINAL mustSetup2FA enforcement is still fully intact and
// correct underneath the MFA_LOGIN_ENFORCED flag (see ../mfa-policy.ts) —
// nothing about the guard's enrollment gate was touched or deleted, only
// gated. This is the "if re-enabled" counterpart to jwt-auth.guard.spec.ts's
// default (flag = false) coverage.
jest.mock("../mfa-policy", () => ({ MFA_LOGIN_ENFORCED: true }));

function makeUser(
  overrides: Partial<{
    status: string;
    mustChangePassword: boolean;
    roleName: string;
    totpEnabledAt: Date | null;
  }> = {},
) {
  return {
    id: "user-1",
    email: "user@example.com",
    organizationId: "org-1",
    status: overrides.status ?? "ACTIVE",
    mustChangePassword: overrides.mustChangePassword ?? false,
    totpEnabledAt: overrides.totpEnabledAt ?? null,
    roles: [
      {
        role: {
          name: overrides.roleName ?? "STUDENT",
          permissions: [{ permission: { key: "attendance.view" } }],
        },
      },
    ],
    schools: [{ schoolId: "school-1" }],
  };
}

function makeContext(headers: Record<string, string> = {}) {
  const request: { headers: Record<string, string>; user?: unknown } = { headers };
  const context = {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
  return { context, request };
}

describe("JwtAuthGuard — mustSetup2FA enforcement (MFA_LOGIN_ENFORCED = true)", () => {
  let jwt: { verifyAsync: jest.Mock };
  let prisma: { user: { findUnique: jest.Mock } };
  let reflector: { getAllAndOverride: jest.Mock };
  let guard: JwtAuthGuard;

  function reflectorReading(metadata: Record<string, unknown>) {
    return jest.fn((key: string) => metadata[key]);
  }

  beforeEach(() => {
    jwt = { verifyAsync: jest.fn() };
    prisma = { user: { findUnique: jest.fn() } };
    reflector = { getAllAndOverride: jest.fn() };
    guard = new JwtAuthGuard(jwt as unknown as JwtService, reflector as unknown as Reflector, prisma as unknown as PrismaService);
  });

  it("blocks a SUPER_ADMIN with no 2FA enabled from a normal protected route", async () => {
    const { context } = makeContext({ authorization: "Bearer good-token" });
    reflector.getAllAndOverride.mockImplementation(reflectorReading({ [ALLOW_TOTP_SETUP_REQUIRED_KEY]: undefined }));
    jwt.verifyAsync.mockResolvedValue({ sub: "user-1" });
    prisma.user.findUnique.mockResolvedValue(makeUser({ roleName: "SUPER_ADMIN", totpEnabledAt: null }));

    await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
    await expect(guard.canActivate(context)).rejects.toThrow("Two-factor authentication must be set up before continuing");
  });

  it("blocks an ORGANIZATION_ADMIN with no 2FA enabled the same way", async () => {
    const { context } = makeContext({ authorization: "Bearer good-token" });
    reflector.getAllAndOverride.mockImplementation(reflectorReading({ [ALLOW_TOTP_SETUP_REQUIRED_KEY]: undefined }));
    jwt.verifyAsync.mockResolvedValue({ sub: "user-1" });
    prisma.user.findUnique.mockResolvedValue(makeUser({ roleName: "ORGANIZATION_ADMIN", totpEnabledAt: null }));

    await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
  });

  it("still allows a SUPER_ADMIN with no 2FA to reach a route marked @AllowTotpSetupRequired()", async () => {
    const { context, request } = makeContext({ authorization: "Bearer good-token" });
    reflector.getAllAndOverride.mockImplementation(reflectorReading({ [ALLOW_TOTP_SETUP_REQUIRED_KEY]: true }));
    jwt.verifyAsync.mockResolvedValue({ sub: "user-1" });
    prisma.user.findUnique.mockResolvedValue(makeUser({ roleName: "SUPER_ADMIN", totpEnabledAt: null }));

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.user).toMatchObject({ id: "user-1", roles: ["SUPER_ADMIN"] });
  });

  it("does not block a SUPER_ADMIN who already has 2FA enabled", async () => {
    const { context } = makeContext({ authorization: "Bearer good-token" });
    reflector.getAllAndOverride.mockReturnValue(undefined);
    jwt.verifyAsync.mockResolvedValue({ sub: "user-1" });
    prisma.user.findUnique.mockResolvedValue(makeUser({ roleName: "SUPER_ADMIN", totpEnabledAt: new Date() }));

    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  it("never applies the 2FA gate to a role that isn't SUPER_ADMIN/ORGANIZATION_ADMIN", async () => {
    const { context } = makeContext({ authorization: "Bearer good-token" });
    reflector.getAllAndOverride.mockReturnValue(undefined);
    jwt.verifyAsync.mockResolvedValue({ sub: "user-1" });
    prisma.user.findUnique.mockResolvedValue(makeUser({ roleName: "SCHOOL_ADMIN", totpEnabledAt: null }));

    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  it("checks mustChangePassword before mustSetup2FA — a SUPER_ADMIN needing both gets the password error first", async () => {
    const { context } = makeContext({ authorization: "Bearer good-token" });
    reflector.getAllAndOverride.mockImplementation(
      reflectorReading({ [ALLOW_PASSWORD_CHANGE_REQUIRED_KEY]: undefined }),
    );
    jwt.verifyAsync.mockResolvedValue({ sub: "user-1" });
    prisma.user.findUnique.mockResolvedValue(
      makeUser({ roleName: "SUPER_ADMIN", totpEnabledAt: null, mustChangePassword: true }),
    );

    await expect(guard.canActivate(context)).rejects.toThrow("Password must be changed before continuing");
  });
});
