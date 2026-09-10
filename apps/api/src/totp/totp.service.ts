import { BadRequestException, ConflictException, Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { generateSecret as generateTotpSecret, generateURI as generateTotpUri, verify as verifyTotpCode } from "otplib";
import * as qrcode from "qrcode";
import * as argon2 from "argon2";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { AuditAction, AuditModuleName } from "../audit/audit-actions";
import { AuthService } from "../auth/auth.service";
import type { TokenPair } from "../auth/auth.service";
import { resolveAuthenticatedUser } from "../auth/resolve-authenticated-user";
import { encryptTotpSecret, decryptTotpSecret } from "./totp-encryption.util";
import { generateRecoveryCodes, normalizeRecoveryCode } from "./recovery-codes.util";
import { EnableTotpDto } from "./dto/enable-totp.dto";
import { DisableTotpDto } from "./dto/disable-totp.dto";
import { VerifyLoginTotpDto } from "./dto/verify-login-totp.dto";

const ISSUER = "Ilays Schools";
const MFA_TOKEN_TTL = "5m";
const MFA_TOKEN_TYPE = "mfa_pending";

async function checkTotpCode(token: string, secret: string): Promise<boolean> {
  const result = await verifyTotpCode({ secret, token });
  return result.valid;
}

interface MfaTokenPayload {
  sub: string;
  type: string;
}

@Injectable()
export class TotpService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly audit: AuditService,
    private readonly auth: AuthService,
  ) {}

  async status(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { totpEnabledAt: true } });
    return { enabled: user.totpEnabledAt !== null };
  }

  // Deliberately doesn't touch the database — the secret only becomes real
  // once EnableTotpDto proves the user can actually generate a matching
  // code with it (see enable()). An abandoned setup leaves nothing to clean
  // up, unlike a "pending" row that would need its own expiry logic.
  async setup(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { email: true, totpEnabledAt: true } });
    if (user.totpEnabledAt) {
      throw new ConflictException("Two-factor authentication is already enabled — disable it first to re-enroll");
    }

    const secret = generateTotpSecret();
    const otpauthUri = generateTotpUri({ issuer: ISSUER, label: user.email, secret });
    const qrCodeDataUri = await qrcode.toDataURL(otpauthUri);

    return { secret, otpauthUri, qrCodeDataUri };
  }

  async enable(userId: string, dto: EnableTotpDto) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { email: true, organizationId: true, totpEnabledAt: true },
    });
    if (user.totpEnabledAt) {
      throw new ConflictException("Two-factor authentication is already enabled — disable it first to re-enroll");
    }
    if (!(await checkTotpCode(dto.code, dto.secret))) {
      throw new BadRequestException("That code didn't match — check your authenticator app and try again");
    }

    const recoveryCodes = generateRecoveryCodes();
    const recoveryCodeHashes = await Promise.all(recoveryCodes.map((c) => argon2.hash(c, { type: argon2.argon2id })));

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: { totpSecret: encryptTotpSecret(dto.secret), totpEnabledAt: new Date() },
      });
      await tx.totpRecoveryCode.createMany({
        data: recoveryCodeHashes.map((codeHash) => ({ userId, codeHash })),
      });
    });

    const actor = await resolveAuthenticatedUser(this.prisma, userId);
    await this.audit.record({
      actor,
      organizationId: user.organizationId,
      schoolId: actor && actor.schoolIds.length > 0 ? actor.schoolIds[0] : null,
      action: AuditAction.TOTP_ENABLED,
      module: AuditModuleName.AUTHENTICATION,
      resourceType: "User",
      resourceId: userId,
      resourceName: user.email,
    });

    // The only moment these ever exist in plaintext outside the user's own
    // authenticator app / password manager — never retrievable again after
    // this response.
    return { recoveryCodes };
  }

  async disable(userId: string, dto: DisableTotpDto) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { email: true, organizationId: true, passwordHash: true, totpEnabledAt: true },
    });
    if (!user.totpEnabledAt) {
      throw new BadRequestException("Two-factor authentication isn't enabled on this account");
    }
    if (!user.passwordHash || !(await argon2.verify(user.passwordHash, dto.password))) {
      throw new UnauthorizedException("Current password is incorrect");
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: userId }, data: { totpSecret: null, totpEnabledAt: null } });
      await tx.totpRecoveryCode.deleteMany({ where: { userId } });
    });

    const actor = await resolveAuthenticatedUser(this.prisma, userId);
    await this.audit.record({
      actor,
      organizationId: user.organizationId,
      schoolId: actor && actor.schoolIds.length > 0 ? actor.schoolIds[0] : null,
      action: AuditAction.TOTP_DISABLED,
      module: AuditModuleName.AUTHENTICATION,
      resourceType: "User",
      resourceId: userId,
      resourceName: user.email,
    });

    return { success: true };
  }

  // The other half of AuthService.login()'s MFA branch — takes the
  // short-lived mfaToken issued there (signed with JWT_MFA_SECRET, a
  // different secret than real access tokens use, so it can never be
  // mistaken for one by JwtAuthGuard) plus a TOTP code or recovery code,
  // and only on success calls through to issue a real session.
  async verifyLogin(dto: VerifyLoginTotpDto): Promise<TokenPair> {
    if (!dto.code && !dto.recoveryCode) {
      throw new BadRequestException("Provide either a code or a recoveryCode");
    }
    if (dto.code && dto.recoveryCode) {
      throw new BadRequestException("Provide only one of code or recoveryCode");
    }

    let payload: MfaTokenPayload;
    try {
      payload = await this.jwt.verifyAsync<MfaTokenPayload>(dto.mfaToken, { secret: process.env.JWT_MFA_SECRET });
    } catch {
      throw new UnauthorizedException("Invalid or expired two-factor session — please log in again");
    }
    if (payload.type !== MFA_TOKEN_TYPE) {
      throw new UnauthorizedException("Invalid two-factor session");
    }

    const userId = payload.sub;
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { email: true, organizationId: true, totpSecret: true, totpEnabledAt: true },
    });
    if (!user.totpEnabledAt || !user.totpSecret) {
      // Disabled between the password step and now — treat as a fresh
      // login attempt rather than silently granting access.
      throw new UnauthorizedException("Two-factor authentication is no longer enabled on this account — please log in again");
    }

    const valid = dto.code
      ? await checkTotpCode(dto.code, decryptTotpSecret(user.totpSecret))
      : await this.consumeRecoveryCode(userId, dto.recoveryCode!);

    if (!valid) {
      const actor = await resolveAuthenticatedUser(this.prisma, userId);
      await this.audit.record({
        actor,
        organizationId: user.organizationId,
        schoolId: actor && actor.schoolIds.length > 0 ? actor.schoolIds[0] : null,
        action: AuditAction.TOTP_VERIFY_FAILED,
        module: AuditModuleName.AUTHENTICATION,
        resourceType: "User",
        resourceId: userId,
        resourceName: user.email,
        status: "FAILED",
        severity: "WARNING",
      });
      throw new UnauthorizedException(dto.code ? "Incorrect code" : "Invalid or already-used recovery code");
    }

    if (dto.recoveryCode) {
      const actor = await resolveAuthenticatedUser(this.prisma, userId);
      await this.audit.record({
        actor,
        organizationId: user.organizationId,
        schoolId: actor && actor.schoolIds.length > 0 ? actor.schoolIds[0] : null,
        action: AuditAction.TOTP_RECOVERY_CODE_USED,
        module: AuditModuleName.AUTHENTICATION,
        resourceType: "User",
        resourceId: userId,
        resourceName: user.email,
        severity: "WARNING",
      });
    }

    return this.auth.completeMfaLogin(userId);
  }

  // Unused codes can't be looked up by value directly (each is hashed with
  // its own argon2 salt) — every remaining code for this user is checked in
  // turn. Ten codes is a small, bounded cost per login attempt.
  private async consumeRecoveryCode(userId: string, rawCode: string): Promise<boolean> {
    const normalized = normalizeRecoveryCode(rawCode);
    const candidates = await this.prisma.totpRecoveryCode.findMany({
      where: { userId, usedAt: null },
    });
    for (const candidate of candidates) {
      if (await argon2.verify(candidate.codeHash, normalized)) {
        await this.prisma.totpRecoveryCode.update({ where: { id: candidate.id }, data: { usedAt: new Date() } });
        return true;
      }
    }
    return false;
  }
}
