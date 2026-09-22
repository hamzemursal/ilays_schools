import * as argon2 from "argon2";
import { AuthService } from "./auth.service";
import { PrismaService } from "../prisma/prisma.service";
import { JwtService } from "@nestjs/jwt";
import { AuditService } from "../audit/audit.service";

// Proves the ORIGINAL 2FA-at-login behavior is still fully intact and
// correct underneath the MFA_LOGIN_ENFORCED flag (see ./mfa-policy.ts) —
// nothing about login()'s TOTP branch itself was touched or deleted, only
// gated. This is the "if re-enabled" counterpart to
// auth.service.spec.ts's default (flag = false) coverage.
jest.mock("./mfa-policy", () => ({ MFA_LOGIN_ENFORCED: true }));

describe("AuthService.login — TOTP branch (MFA_LOGIN_ENFORCED = true)", () => {
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
          totpEnabledAt: new Date(),
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

  it("returns an MFA challenge instead of real tokens for an account with 2FA enabled", async () => {
    const result = await service.login("admin@example.com", "correct-password");

    expect(result).toEqual({ mfaRequired: true, mfaToken: "signed.jwt.token" });
    // Signed with a distinct secret/claim from the real access token — see
    // the JWT_MFA_SECRET comment on MfaChallenge for why this matters.
    expect(jwt.signAsync).toHaveBeenCalledWith(
      { sub: "user-1", type: "mfa_pending" },
      expect.objectContaining({ secret: process.env.JWT_MFA_SECRET }),
    );
    // No LOGIN audit event yet — see completeMfaLogin for where it actually fires.
    expect(audit.record).not.toHaveBeenCalledWith(expect.objectContaining({ action: "LOGIN" }));
    expect(prisma.refreshToken.create).not.toHaveBeenCalled();
  });

  it("still issues real tokens directly for an account with 2FA not enabled", async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: "user-1",
      email: "admin@example.com",
      organizationId: "org-1",
      status: "ACTIVE",
      passwordHash,
      totpEnabledAt: null,
      roles: [],
      schools: [],
    });

    const result = await service.login("admin@example.com", "correct-password");

    expect("mfaRequired" in result).toBe(false);
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: "LOGIN" }));
  });
});
