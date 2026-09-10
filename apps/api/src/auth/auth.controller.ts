import { Body, Controller, Get, Post, Req, Res, UnauthorizedException } from "@nestjs/common";
import type { Request, Response } from "express";
import { AuthService, TokenPair } from "./auth.service";
import { LoginDto } from "./dto/login.dto";
import { AcceptInviteDto } from "./dto/accept-invite.dto";
import { ChangePasswordDto } from "./dto/change-password.dto";
import { RefreshSessionDto } from "./dto/refresh-session.dto";
import { Public } from "./decorators/public.decorator";
import { AllowPasswordChangeRequired } from "./decorators/allow-password-change-required.decorator";
import { CurrentUser } from "./decorators/current-user.decorator";
import { PrismaService } from "../prisma/prisma.service";
import { DocumentsService } from "../documents/documents.service";
import type { AuthenticatedUser } from "./types/authenticated-user";

// One browser can have several independent logins open at once (different
// tabs, different accounts, or the same account twice) — each refresh-token
// cookie is therefore named per login session (sessionId = that session's
// RefreshToken row id) instead of one fixed name shared by the whole
// browser. Without this, a second tab logging in would silently overwrite
// the first tab's cookie, and the first tab would eventually refresh into
// the second tab's identity. See TokenPair.sessionId / AuthService.
const REFRESH_COOKIE_PREFIX = "refresh_token_";
// A request with no sessionId (an old cached frontend bundle mid-deploy, or
// a brand-new tab that never received one) falls back to this fixed name —
// nothing sets it anymore going forward, but reading it keeps a session
// alive that was established just before this change shipped.
const REFRESH_COOKIE_LEGACY_NAME = "refresh_token";
const REFRESH_COOKIE_PATH = "/api/v1/auth";

function refreshCookieName(sessionId?: string): string {
  return sessionId ? `${REFRESH_COOKIE_PREFIX}${sessionId}` : REFRESH_COOKIE_LEGACY_NAME;
}

// The web app (Vercel) and this API (Render) are on different registrable
// domains, so every refresh-cookie request is genuinely cross-site — a
// "SameSite=Lax" cookie is never sent on those (only on top-level
// navigations), which silently broke session restore on any full page
// reload. "None" is required to have it sent at all, and the Secure flag
// is mandatory the moment SameSite is "None" — browsers drop the cookie
// outright otherwise. Local dev keeps Lax/non-Secure since localhost:3010
// -> localhost:4000 is same-site and plain HTTP.
const isCrossSiteDeployment = process.env.NODE_ENV === "production";
const REFRESH_COOKIE_OPTIONS = {
  path: REFRESH_COOKIE_PATH,
  httpOnly: true,
  secure: isCrossSiteDeployment,
  sameSite: (isCrossSiteDeployment ? "none" : "lax") as "none" | "lax",
};

@Controller("auth")
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly prisma: PrismaService,
    private readonly documents: DocumentsService,
  ) {}

  @Public()
  @Post("login")
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response) {
    const tokens = await this.auth.login(dto.email, dto.password);
    this.setRefreshCookie(res, tokens);
    return { accessToken: tokens.accessToken, sessionId: tokens.sessionId };
  }

  @Public()
  @Post("refresh")
  async refresh(
    @Body() dto: RefreshSessionDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const oldCookieName = refreshCookieName(dto.sessionId);
    const raw = req.cookies?.[oldCookieName];
    if (!raw) throw new UnauthorizedException("No refresh token");

    const tokens = await this.auth.refresh(raw);
    // Rotation issues a new sessionId (new RefreshToken row), so the cookie
    // name changes too — the old one is now dead and must be cleared, or it
    // would sit in the browser forever pointing at a revoked token.
    res.clearCookie(oldCookieName, REFRESH_COOKIE_OPTIONS);
    this.setRefreshCookie(res, tokens);
    return { accessToken: tokens.accessToken, sessionId: tokens.sessionId };
  }

  @Public()
  @Post("logout")
  async logout(
    @Body() dto: RefreshSessionDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const cookieName = refreshCookieName(dto.sessionId);
    const raw = req.cookies?.[cookieName];
    if (raw) await this.auth.logout(raw);
    // clearCookie must be called with the same SameSite/Secure attributes
    // the cookie was actually set with, or some browsers silently keep it.
    // Only this one session's cookie is cleared — every other tab/session's
    // cookie has a different name and is untouched.
    res.clearCookie(cookieName, REFRESH_COOKIE_OPTIONS);
    return { success: true };
  }

  @Public()
  @Post("accept-invite")
  async acceptInvite(@Body() dto: AcceptInviteDto, @Res({ passthrough: true }) res: Response) {
    const tokens = await this.auth.acceptInvite(dto.token, dto.password);
    this.setRefreshCookie(res, tokens);
    return { accessToken: tokens.accessToken, sessionId: tokens.sessionId };
  }

  @AllowPasswordChangeRequired()
  @Get("me")
  async me(@CurrentUser() user: AuthenticatedUser) {
    const [schools, teacher, guardian, student, self, logoUrls] = await Promise.all([
      this.prisma.school.findMany({
        where: { id: { in: user.schoolIds } },
        select: { id: true, name: true },
      }),
      this.prisma.teacher.findFirst({ where: { userId: user.id }, select: { id: true } }),
      this.prisma.guardian.findFirst({ where: { userId: user.id }, select: { id: true } }),
      this.prisma.student.findFirst({ where: { userId: user.id }, select: { id: true } }),
      this.prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: { mustChangePassword: true } }),
      this.documents.getSchoolLogoUrls(user.schoolIds),
    ]);
    return {
      ...user,
      schools: schools.map((s) => ({ ...s, logoUrl: logoUrls[s.id] ?? null })),
      teacherId: teacher?.id ?? null,
      guardianId: guardian?.id ?? null,
      studentId: student?.id ?? null,
      mustChangePassword: self.mustChangePassword,
    };
  }

  @AllowPasswordChangeRequired()
  @Post("change-password")
  async changePassword(@CurrentUser() user: AuthenticatedUser, @Body() dto: ChangePasswordDto) {
    await this.auth.changeMyPassword(user.id, dto.currentPassword, dto.newPassword);
    return { success: true };
  }

  private setRefreshCookie(res: Response, tokens: TokenPair) {
    res.cookie(refreshCookieName(tokens.sessionId), tokens.refreshToken, {
      ...REFRESH_COOKIE_OPTIONS,
      expires: tokens.refreshTokenExpiresAt,
    });
  }
}
