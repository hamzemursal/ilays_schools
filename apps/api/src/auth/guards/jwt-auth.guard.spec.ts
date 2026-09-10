import { ExecutionContext, ForbiddenException, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Reflector } from "@nestjs/core";
import { JwtAuthGuard } from "./jwt-auth.guard";
import { IS_PUBLIC_KEY } from "../decorators/public.decorator";
import { ALLOW_PASSWORD_CHANGE_REQUIRED_KEY } from "../decorators/allow-password-change-required.decorator";
import { PrismaService } from "../../prisma/prisma.service";

// Minimal double for the parts of a Nest User row the guard actually reads —
// roles/permissions/schools nested exactly as the guard's own `include`
// shapes them, so this stays a faithful stand-in without needing a real DB.
function makeUser(overrides: Partial<{ status: string; mustChangePassword: boolean }> = {}) {
  return {
    id: "user-1",
    email: "user@example.com",
    organizationId: "org-1",
    status: overrides.status ?? "ACTIVE",
    mustChangePassword: overrides.mustChangePassword ?? false,
    roles: [
      {
        role: {
          name: "STUDENT",
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

describe("JwtAuthGuard", () => {
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
});
