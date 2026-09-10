process.env.TOTP_ENCRYPTION_KEY = "test-only-totp-encryption-key";

import { BadRequestException, ConflictException, UnauthorizedException } from "@nestjs/common";
import * as argon2 from "argon2";
import { TotpService } from "./totp.service";
import { PrismaService } from "../prisma/prisma.service";
import { JwtService } from "@nestjs/jwt";
import { AuditService } from "../audit/audit.service";
import { AuthService } from "../auth/auth.service";
import { encryptTotpSecret } from "./totp-encryption.util";

jest.mock("qrcode", () => ({
  toDataURL: jest.fn().mockResolvedValue("data:image/png;base64,mock"),
}));

const verifyMock = jest.fn();
jest.mock("otplib", () => ({
  generateSecret: jest.fn(() => "MOCKSECRETBASE32"),
  generateURI: jest.fn(() => "otpauth://totp/mock"),
  verify: (...args: unknown[]) => verifyMock(...args),
}));

describe("TotpService", () => {
  let prisma: {
    user: { findUniqueOrThrow: jest.Mock; findUnique: jest.Mock; update: jest.Mock };
    totpRecoveryCode: { createMany: jest.Mock; findMany: jest.Mock; update: jest.Mock; deleteMany: jest.Mock };
    $transaction: jest.Mock;
  };
  let jwt: { verifyAsync: jest.Mock };
  let audit: { record: jest.Mock };
  let auth: { completeMfaLogin: jest.Mock };
  let service: TotpService;

  beforeEach(() => {
    verifyMock.mockReset();
    prisma = {
      user: {
        findUniqueOrThrow: jest.fn(),
        findUnique: jest.fn().mockResolvedValue({ id: "user-1", email: "a@b.com", organizationId: "org-1", roles: [], schools: [] }),
        update: jest.fn(),
      },
      totpRecoveryCode: {
        createMany: jest.fn().mockResolvedValue({ count: 10 }),
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn(),
        deleteMany: jest.fn(),
      },
      $transaction: jest.fn((cb: (tx: unknown) => unknown) => cb(prisma)),
    };
    jwt = { verifyAsync: jest.fn() };
    audit = { record: jest.fn().mockResolvedValue(undefined) };
    auth = { completeMfaLogin: jest.fn().mockResolvedValue({ accessToken: "at", refreshToken: "rt", refreshTokenExpiresAt: new Date(), sessionId: "s1" }) };
    service = new TotpService(
      prisma as unknown as PrismaService,
      jwt as unknown as JwtService,
      audit as unknown as AuditService,
      auth as unknown as AuthService,
    );
  });

  describe("setup", () => {
    it("refuses to re-setup when already enabled", async () => {
      prisma.user.findUniqueOrThrow.mockResolvedValue({ email: "a@b.com", totpEnabledAt: new Date() });

      await expect(service.setup("user-1")).rejects.toThrow(ConflictException);
    });

    it("returns a secret, URI, and QR code without persisting anything", async () => {
      prisma.user.findUniqueOrThrow.mockResolvedValue({ email: "a@b.com", totpEnabledAt: null });

      const result = await service.setup("user-1");

      expect(result.secret).toBe("MOCKSECRETBASE32");
      expect(result.qrCodeDataUri).toContain("data:image/png");
      expect(prisma.user.update).not.toHaveBeenCalled();
    });
  });

  describe("enable", () => {
    it("rejects an incorrect confirmation code", async () => {
      prisma.user.findUniqueOrThrow.mockResolvedValue({ email: "a@b.com", organizationId: "org-1", totpEnabledAt: null });
      verifyMock.mockResolvedValue({ valid: false });

      await expect(service.enable("user-1", { secret: "SECRET", code: "000000" })).rejects.toThrow(BadRequestException);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it("persists an encrypted secret and returns 10 plaintext recovery codes on success", async () => {
      prisma.user.findUniqueOrThrow.mockResolvedValue({ email: "a@b.com", organizationId: "org-1", totpEnabledAt: null });
      verifyMock.mockResolvedValue({ valid: true });

      const result = await service.enable("user-1", { secret: "SECRET", code: "123456" });

      expect(result.recoveryCodes).toHaveLength(10);
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ totpEnabledAt: expect.any(Date) }) }),
      );
      // The stored secret must never be the plaintext one that was passed in.
      const updateCall = prisma.user.update.mock.calls[0][0];
      expect(updateCall.data.totpSecret).not.toBe("SECRET");
      expect(prisma.totpRecoveryCode.createMany).toHaveBeenCalled();
      const createdHashes = prisma.totpRecoveryCode.createMany.mock.calls[0][0].data.map((d: { codeHash: string }) => d.codeHash);
      expect(createdHashes).toHaveLength(10);
      // Every recovery code returned must actually verify against its stored hash.
      for (let i = 0; i < result.recoveryCodes.length; i++) {
        await expect(argon2.verify(createdHashes[i], result.recoveryCodes[i])).resolves.toBe(true);
      }
      expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: "TOTP_ENABLED" }));
    });
  });

  describe("disable", () => {
    it("refuses when 2FA isn't enabled", async () => {
      prisma.user.findUniqueOrThrow.mockResolvedValue({ email: "a@b.com", organizationId: "org-1", passwordHash: "hash", totpEnabledAt: null });

      await expect(service.disable("user-1", { password: "whatever" })).rejects.toThrow(BadRequestException);
    });

    it("rejects an incorrect password", async () => {
      const passwordHash = await argon2.hash("correct-password", { type: argon2.argon2id });
      prisma.user.findUniqueOrThrow.mockResolvedValue({ email: "a@b.com", organizationId: "org-1", passwordHash, totpEnabledAt: new Date() });

      await expect(service.disable("user-1", { password: "wrong-password" })).rejects.toThrow(UnauthorizedException);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it("clears the secret and deletes recovery codes on success", async () => {
      const passwordHash = await argon2.hash("correct-password", { type: argon2.argon2id });
      prisma.user.findUniqueOrThrow.mockResolvedValue({ email: "a@b.com", organizationId: "org-1", passwordHash, totpEnabledAt: new Date() });

      await service.disable("user-1", { password: "correct-password" });

      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { totpSecret: null, totpEnabledAt: null } }),
      );
      expect(prisma.totpRecoveryCode.deleteMany).toHaveBeenCalledWith({ where: { userId: "user-1" } });
      expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: "TOTP_DISABLED" }));
    });
  });

  describe("verifyLogin", () => {
    it("rejects when neither code nor recoveryCode is provided", async () => {
      await expect(service.verifyLogin({ mfaToken: "t" })).rejects.toThrow(BadRequestException);
    });

    it("rejects when both code and recoveryCode are provided", async () => {
      await expect(service.verifyLogin({ mfaToken: "t", code: "123456", recoveryCode: "AAAAA-BBBBB" })).rejects.toThrow(
        BadRequestException,
      );
    });

    it("rejects an invalid or expired mfaToken", async () => {
      jwt.verifyAsync.mockRejectedValue(new Error("expired"));

      await expect(service.verifyLogin({ mfaToken: "bad", code: "123456" })).rejects.toThrow(UnauthorizedException);
      expect(auth.completeMfaLogin).not.toHaveBeenCalled();
    });

    it("rejects a wrong-type token even if it verifies", async () => {
      jwt.verifyAsync.mockResolvedValue({ sub: "user-1", type: "something_else" });

      await expect(service.verifyLogin({ mfaToken: "t", code: "123456" })).rejects.toThrow(UnauthorizedException);
    });

    it("rejects an incorrect TOTP code and audit-logs the failure", async () => {
      jwt.verifyAsync.mockResolvedValue({ sub: "user-1", type: "mfa_pending" });
      prisma.user.findUniqueOrThrow.mockResolvedValue({
        email: "a@b.com",
        organizationId: "org-1",
        totpSecret: encryptTotpSecret("REALSECRET"),
        totpEnabledAt: new Date(),
      });
      verifyMock.mockResolvedValue({ valid: false });

      await expect(service.verifyLogin({ mfaToken: "t", code: "000000" })).rejects.toThrow(UnauthorizedException);
      expect(auth.completeMfaLogin).not.toHaveBeenCalled();
      expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: "TOTP_VERIFY_FAILED" }));
    });

    it("completes login on a correct TOTP code", async () => {
      jwt.verifyAsync.mockResolvedValue({ sub: "user-1", type: "mfa_pending" });
      prisma.user.findUniqueOrThrow.mockResolvedValue({
        email: "a@b.com",
        organizationId: "org-1",
        totpSecret: encryptTotpSecret("REALSECRET"),
        totpEnabledAt: new Date(),
      });
      verifyMock.mockResolvedValue({ valid: true });

      const tokens = await service.verifyLogin({ mfaToken: "t", code: "123456" });

      expect(auth.completeMfaLogin).toHaveBeenCalledWith("user-1");
      expect(tokens.accessToken).toBe("at");
    });

    it("completes login on a correct recovery code and marks it used", async () => {
      jwt.verifyAsync.mockResolvedValue({ sub: "user-1", type: "mfa_pending" });
      prisma.user.findUniqueOrThrow.mockResolvedValue({
        email: "a@b.com",
        organizationId: "org-1",
        totpSecret: encryptTotpSecret("REALSECRET"),
        totpEnabledAt: new Date(),
      });
      const codeHash = await argon2.hash("ABCDE-FGHJK", { type: argon2.argon2id });
      prisma.totpRecoveryCode.findMany.mockResolvedValue([{ id: "rc-1", codeHash }]);

      const tokens = await service.verifyLogin({ mfaToken: "t", recoveryCode: "abcde-fghjk" });

      expect(prisma.totpRecoveryCode.update).toHaveBeenCalledWith({ where: { id: "rc-1" }, data: { usedAt: expect.any(Date) } });
      expect(auth.completeMfaLogin).toHaveBeenCalledWith("user-1");
      expect(tokens.accessToken).toBe("at");
      expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: "TOTP_RECOVERY_CODE_USED" }));
    });

    it("rejects an already-used recovery code", async () => {
      jwt.verifyAsync.mockResolvedValue({ sub: "user-1", type: "mfa_pending" });
      prisma.user.findUniqueOrThrow.mockResolvedValue({
        email: "a@b.com",
        organizationId: "org-1",
        totpSecret: encryptTotpSecret("REALSECRET"),
        totpEnabledAt: new Date(),
      });
      // findMany only ever returns usedAt: null rows in real Prisma (see the
      // where clause in consumeRecoveryCode) — an already-used code simply
      // isn't among the candidates, so it never matches.
      prisma.totpRecoveryCode.findMany.mockResolvedValue([]);

      await expect(service.verifyLogin({ mfaToken: "t", recoveryCode: "ABCDE-FGHJK" })).rejects.toThrow(UnauthorizedException);
      expect(auth.completeMfaLogin).not.toHaveBeenCalled();
    });
  });
});
