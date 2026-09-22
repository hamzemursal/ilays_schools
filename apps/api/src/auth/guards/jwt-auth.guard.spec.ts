import { ExecutionContext, ForbiddenException, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Reflector } from "@nestjs/core";
import { JwtAuthGuard } from "./jwt-auth.guard";
import { IS_PUBLIC_KEY } from "../decorators/public.decorator";
import { ALLOW_PASSWORD_CHANGE_REQUIRED_KEY } from "../decorators/allow-password-change-required.decorator";
import { ALLOW_TOTP_SETUP_REQUIRED_KEY } from "../decorators/allow-totp-setup-required.decorator";
import { PrismaService } from "../../prisma/prisma.service";

// Minimal double for the parts of a Nest User row the guard actually reads —
// roles/permissions/schools nested exactly as the guard's own `include`
// shapes them, so this stays a faithful stand-in without needing a real DB.
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

// getHandler()/getClass() return values are irrelevant here — the fake
// Reflector below never inspects them, it answers purely from the metadata
// map each test supplies, so these are opaque placeholders.
function makeContext(headers: Record<string, string> = {}) {
  const request: { headers: Record<string, string>; user?: unknown } = { headers };
  const context = {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
  return { context, request };
}

describe("JwtAuthGuard (MFA_LOGIN_ENFORCED = false)", () => {
  let jwt: { verifyAsync: jest.Mock };
  let prisma: { user: { findUnique: jest.Mock } };
  let reflector: { getAllAndOverride: jest.Mock };
  let guard: JwtAuthGuard;

  // Reflector metadata is read by key, not by call order — this fake reads
  // whichever key the test's `metadata` map declares, the same shape
  // `@SetMetadata` produces for `@Public()` / `@AllowPasswordChangeRequired()`.
  function reflectorReading(metadata: Record<string, unknown>) {
    return jest.fn((key: string) => metadata[key]);
  }

  beforeEach(() => {
    jwt = { verifyAsync: jest.fn() };
    prisma = { user: { findUnique: jest.fn() } };
    reflector = { getAllAndOverride: jest.fn() };
    guard = new JwtAuthGuard(jwt as unknown as JwtService, reflector as unknown as Reflector, prisma as unknown as PrismaService);
  });

  it("lets a @Public() route through without checking for a token at all", async () => {
    const { context } = makeContext();
    reflector.getAllAndOverride.mockImplementation((key: string) => key === IS_PUBLIC_KEY);

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(jwt.verifyAsync).not.toHaveBeenCalled();
  });

  it("rejects a request with no Authorization header", async () => {
    const { context } = makeContext();
    reflector.getAllAndOverride.mockReturnValue(undefined);

    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
    await expect(guard.canActivate(context)).rejects.toThrow("Missing access token");
  });

  it("rejects an invalid or expired token", async () => {
    const { context } = makeContext({ authorization: "Bearer bad-token" });
    reflector.getAllAndOverride.mockReturnValue(undefined);
    jwt.verifyAsync.mockRejectedValue(new Error("expired"));

    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
    await expect(guard.canActivate(context)).rejects.toThrow("Invalid or expired access token");
  });

  it("rejects when the user no longer exists", async () => {
    const { context } = makeContext({ authorization: "Bearer good-token" });
    reflector.getAllAndOverride.mockReturnValue(undefined);
    jwt.verifyAsync.mockResolvedValue({ sub: "user-1" });
    prisma.user.findUnique.mockResolvedValue(null);

    await expect(guard.canActivate(context)).rejects.toThrow("Account is not active");
  });

  it("rejects a SUSPENDED account even with a valid, unexpired token", async () => {
    const { context } = makeContext({ authorization: "Bearer good-token" });
    reflector.getAllAndOverride.mockReturnValue(undefined);
    jwt.verifyAsync.mockResolvedValue({ sub: "user-1" });
    prisma.user.findUnique.mockResolvedValue(makeUser({ status: "SUSPENDED" }));

    await expect(guard.canActivate(context)).rejects.toThrow("Account is not active");
  });

  // --- The mustChangePassword fix itself ---------------------------------

  it("blocks a mustChangePassword account from a normal protected route", async () => {
    const { context } = makeContext({ authorization: "Bearer good-token" });
    reflector.getAllAndOverride.mockImplementation(
      reflectorReading({ [ALLOW_PASSWORD_CHANGE_REQUIRED_KEY]: undefined }),
    );
    jwt.verifyAsync.mockResolvedValue({ sub: "user-1" });
    prisma.user.findUnique.mockResolvedValue(makeUser({ mustChangePassword: true }));

    await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
    await expect(guard.canActivate(context)).rejects.toThrow("Password must be changed before continuing");
  });

  it("still allows a mustChangePassword account to reach a route marked @AllowPasswordChangeRequired()", async () => {
    const { context, request } = makeContext({ authorization: "Bearer good-token" });
    reflector.getAllAndOverride.mockImplementation(
      reflectorReading({ [ALLOW_PASSWORD_CHANGE_REQUIRED_KEY]: true }),
    );
    jwt.verifyAsync.mockResolvedValue({ sub: "user-1" });
    prisma.user.findUnique.mockResolvedValue(makeUser({ mustChangePassword: true }));

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.user).toMatchObject({ id: "user-1" });
  });

  it("does not block a normal (password already set) account, and populates request.user correctly", async () => {
    const { context, request } = makeContext({ authorization: "Bearer good-token" });
    reflector.getAllAndOverride.mockReturnValue(undefined);
    jwt.verifyAsync.mockResolvedValue({ sub: "user-1" });
    prisma.user.findUnique.mockResolvedValue(makeUser({ mustChangePassword: false }));

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.user).toEqual({
      id: "user-1",
      email: "user@example.com",
      organizationId: "org-1",
      roles: ["STUDENT"],
      permissions: ["attendance.view"],
      schoolIds: ["school-1"],
    });
  });

  // --- The mustSetup2FA enforcement (MFA_LOGIN_ENFORCED = false) ---------
  //
  // With the policy disabled (see ../mfa-policy.ts), no role is forced into
  // TOTP enrollment — the "if re-enabled" version of this same gate,
  // proving the original enforcement logic is still correct underneath the
  // flag, lives in jwt-auth.guard.mfa-enforced.spec.ts.

  it("does not block a SUPER_ADMIN with no 2FA enabled, while MFA_LOGIN_ENFORCED is false", async () => {
    const { context, request } = makeContext({ authorization: "Bearer good-token" });
    reflector.getAllAndOverride.mockReturnValue(undefined);
    jwt.verifyAsync.mockResolvedValue({ sub: "user-1" });
    prisma.user.findUnique.mockResolvedValue(makeUser({ roleName: "SUPER_ADMIN", totpEnabledAt: null }));

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.user).toMatchObject({ id: "user-1", roles: ["SUPER_ADMIN"] });
  });

  it("does not block an ORGANIZATION_ADMIN with no 2FA enabled either, while MFA_LOGIN_ENFORCED is false", async () => {
    const { context } = makeContext({ authorization: "Bearer good-token" });
    reflector.getAllAndOverride.mockReturnValue(undefined);
    jwt.verifyAsync.mockResolvedValue({ sub: "user-1" });
    prisma.user.findUnique.mockResolvedValue(makeUser({ roleName: "ORGANIZATION_ADMIN", totpEnabledAt: null }));

    await expect(guard.canActivate(context)).resolves.toBe(true);
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

  // mustChangePassword is unrelated to 2FA and must keep being enforced
  // regardless of the MFA_LOGIN_ENFORCED policy.
  it("still blocks a mustChangePassword SUPER_ADMIN even though the 2FA gate itself is disabled", async () => {
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
