import { Injectable, UnauthorizedException, BadRequestException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import * as argon2 from "argon2";
import { randomBytes, createHash } from "node:crypto";
import { PrismaService } from "../prisma/prisma.service";

const ACCESS_TOKEN_TTL = "15m";
const REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  refreshTokenExpiresAt: Date;
}

function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async login(identifier: string, password: string): Promise<TokenPair> {
    const user = await this.resolveLoginUser(identifier);
    if (!user || !user.passwordHash) {
      throw new UnauthorizedException("Invalid email or password");
    }
    if (user.status !== "ACTIVE") {
      throw new UnauthorizedException("Account is not active yet");
    }

    const valid = await argon2.verify(user.passwordHash, password);
    if (!valid) {
      throw new UnauthorizedException("Invalid email or password");
    }

    return this.issueTokenPair(user.id);
  }

  // Every non-student account is a real email — that lookup is tried first
  // and is completely unchanged from before. Only when it misses do we try
  // the identifier as a Student Login ID (StudentEnrollment.studentNumber,
  // e.g. "STU-2027-00003"): find the currently active enrollment with that
  // number, then log in as *that* student's linked User. A student with no
  // portal account (userId null — including every PRIMARY student, who can
  // never get one) simply has nothing to resolve to here.
  private async resolveLoginUser(identifier: string) {
    const byEmail = await this.prisma.user.findUnique({ where: { email: identifier } });
    if (byEmail) return byEmail;

    // studentNumber is only unique per (school, admitting year) — see
    // generateStudentNumber — so the same short ID can exist at two
    // different schools. Restricting to enrollments whose student actually
    // has a portal account (userId set) resolves that in every case except
    // the rare one where two different schools' students both got the same
    // number AND both have portal accounts, which is a genuine ambiguity
    // this ID format can't rule out — treated here as "no match" rather
    // than guessing, since logging in as the wrong student is far worse
    // than a rejected login.
    const matches = await this.prisma.studentEnrollment.findMany({
      where: { studentNumber: identifier, status: "ACTIVE", student: { userId: { not: null } } },
      include: { student: true },
    });
    if (matches.length !== 1) return null;

    return this.prisma.user.findUnique({ where: { id: matches[0].student.userId! } });
  }

  async refresh(rawRefreshToken: string): Promise<TokenPair> {
    const tokenHash = hashToken(rawRefreshToken);
    const existing = await this.prisma.refreshToken.findUnique({ where: { tokenHash } });

    if (!existing) {
      throw new UnauthorizedException("Invalid refresh token");
    }

    if (existing.revoked) {
      // A revoked token being presented again means it was stolen/replayed —
      // kill the whole session family for this user, not just this token.
      await this.prisma.refreshToken.updateMany({
        where: { userId: existing.userId, revoked: false },
        data: { revoked: true },
      });
      throw new UnauthorizedException("Refresh token reuse detected — all sessions revoked");
    }

    if (existing.expiresAt < new Date()) {
      throw new UnauthorizedException("Refresh token expired");
    }

    await this.prisma.refreshToken.update({
      where: { id: existing.id },
      data: { revoked: true },
    });

    return this.issueTokenPair(existing.userId);
  }

  async logout(rawRefreshToken: string): Promise<void> {
    const tokenHash = hashToken(rawRefreshToken);
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash, revoked: false },
      data: { revoked: true },
    });
  }

  async acceptInvite(rawToken: string, password: string): Promise<TokenPair> {
    const tokenHash = hashToken(rawToken);
    const invitation = await this.prisma.invitation.findUnique({ where: { tokenHash } });

    if (!invitation || invitation.status !== "PENDING") {
      throw new BadRequestException("Invitation is invalid or already used");
    }
    if (invitation.expiresAt < new Date()) {
      throw new BadRequestException("Invitation has expired");
    }

    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: invitation.userId },
        data: { passwordHash, status: "ACTIVE" },
      }),
      this.prisma.invitation.update({
        where: { id: invitation.id },
        data: { status: "ACCEPTED", acceptedAt: new Date() },
      }),
    ]);

    return this.issueTokenPair(invitation.userId);
  }

  // Self-service password change — currently the only path that clears
  // mustChangePassword (see Student Portal account creation, which sets it).
  // Requiring the current password even though the caller is already
  // authenticated is deliberate defense in depth: a hijacked session token
  // alone shouldn't be enough to lock the real owner out by changing it.
  async changeMyPassword(userId: string, currentPassword: string, newPassword: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.passwordHash) {
      throw new UnauthorizedException("Invalid account state");
    }

    const valid = await argon2.verify(user.passwordHash, currentPassword);
    if (!valid) {
      throw new UnauthorizedException("Current password is incorrect");
    }

    const passwordHash = await argon2.hash(newPassword, { type: argon2.argon2id });
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash, mustChangePassword: false },
    });
  }

  private async issueTokenPair(userId: string): Promise<TokenPair> {
    const accessToken = await this.jwt.signAsync(
      { sub: userId },
      { secret: process.env.JWT_ACCESS_SECRET, expiresIn: ACCESS_TOKEN_TTL },
    );

    const rawRefreshToken = randomBytes(32).toString("hex");
    const refreshTokenExpiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_MS);

    await this.prisma.refreshToken.create({
      data: {
        userId,
        tokenHash: hashToken(rawRefreshToken),
        expiresAt: refreshTokenExpiresAt,
      },
    });

    return { accessToken, refreshToken: rawRefreshToken, refreshTokenExpiresAt };
  }
}
