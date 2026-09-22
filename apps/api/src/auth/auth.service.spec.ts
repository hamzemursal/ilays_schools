import * as argon2 from "argon2";
import { UnauthorizedException } from "@nestjs/common";
import { AuthService } from "./auth.service";
import { PrismaService } from "../prisma/prisma.service";
import { JwtService } from "@nestjs/jwt";
import { AuditService } from "../audit/audit.service";

// Only login()'s TOTP branch is covered here — the rest of AuthService
// (refresh/logout/acceptInvite/changeMyPassword) had no prior test coverage
// and isn't part of what changed for 2FA. This file exercises the CURRENT
// default policy (MFA_LOGIN_ENFORCED = false, see ./mfa-policy.ts); see
// auth.service.mfa-enforced.spec.ts for the same branch with the policy
// mocked back to true.
describe("AuthService.login — TOTP branch (MFA_LOGIN_ENFORCED = false)", () => {
  let prisma: {
    user: { findUnique: jest.Mock; findUniqueOrThrow: jest.Mock };
    studentEnrollment: { findMany: jest.Mock };
    refreshToken: { create: jest.Mock };
  };
  let jwt: { signAsync: jest.Mock };
  let audit: { record: jest.Mock };
  let service: AuthService;
  let passwordHash: string;

  beforeAll(async () => {
    passwordHash = await argon2.hash("correct-password", { type: argon2.argon2id });
  });

  beforeEach(() => {
    prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          id: "user-1",
          email: "admin@example.com",
          organizationId: "org-1",
          status: "ACTIVE",
          passwordHash,
          totpEnabledAt: null,
          roles: [],
          schools: [],
        }),
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          id: "user-1",
          email: "admin@example.com",
          organizationId: "org-1",
        }),
      },
      studentEnrollment: { findMany: jest.fn() },
      refreshToken: { create: jest.fn().mockResolvedValue({ id: "session-1" }) },
    };
    jwt = { signAsync: jest.fn().mockResolvedValue("signed.jwt.token") };
    audit = { record: jest.fn().mockResolvedValue(undefined) };
    service = new AuthService(prisma as unknown as PrismaService, jwt as unknown as JwtService, audit as unknown as AuditService);
  });

  it("issues real tokens directly for an account with 2FA not enabled (unchanged behavior)", async () => {
    const result = await service.login("admin@example.com", "correct-password");

    expect("mfaRequired" in result).toBe(false);
    if (!("mfaRequired" in result)) {
      expect(result.accessToken).toBe("signed.jwt.token");
    }
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: "LOGIN" }));
  });

  // MFA_LOGIN_ENFORCED is false by default (see ./mfa-policy.ts) — an
  // account with 2FA enabled still logs straight in with password alone.
  // The "if it were re-enabled" version of this same scenario is covered by
  // auth.service.mfa-enforced.spec.ts, which mocks the policy back to true.
  it("issues real tokens directly for an account with 2FA enabled too, while MFA_LOGIN_ENFORCED is false", async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: "user-1",
      email: "admin@example.com",
      organizationId: "org-1",
      status: "ACTIVE",
      passwordHash,
      totpEnabledAt: new Date(),
      roles: [],
      schools: [],
    });

    const result = await service.login("admin@example.com", "correct-password");

    expect("mfaRequired" in result).toBe(false);
    if (!("mfaRequired" in result)) {
      expect(result.accessToken).toBe("signed.jwt.token");
    }
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: "LOGIN" }));
    expect(prisma.refreshToken.create).toHaveBeenCalled();
  });

  it("still rejects a wrong password even when 2FA is enabled", async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: "user-1",
      email: "admin@example.com",
      organizationId: "org-1",
      status: "ACTIVE",
      passwordHash,
      totpEnabledAt: new Date(),
      roles: [],
      schools: [],
    });

    await expect(service.login("admin@example.com", "wrong-password")).rejects.toThrow(UnauthorizedException);
  });

  describe("completeMfaLogin", () => {
    it("issues real tokens and records the LOGIN audit event", async () => {
      const result = await service.completeMfaLogin("user-1");

      expect(result.accessToken).toBe("signed.jwt.token");
      expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: "LOGIN" }));
      expect(prisma.refreshToken.create).toHaveBeenCalled();
    });
  });
});
