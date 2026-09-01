import { Body, Controller, Get, Post, Req, Res, UnauthorizedException } from "@nestjs/common";
import type { Request, Response } from "express";
import { AuthService, TokenPair } from "./auth.service";
import { LoginDto } from "./dto/login.dto";
import { AcceptInviteDto } from "./dto/accept-invite.dto";
import { ChangePasswordDto } from "./dto/change-password.dto";
import { Public } from "./decorators/public.decorator";
import { CurrentUser } from "./decorators/current-user.decorator";
import { PrismaService } from "../prisma/prisma.service";
import type { AuthenticatedUser } from "./types/authenticated-user";

const REFRESH_COOKIE = "refresh_token";
const REFRESH_COOKIE_PATH = "/api/v1/auth";

@Controller("auth")
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly prisma: PrismaService,
  ) {}

  @Public()
  @Post("login")
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response) {
    const tokens = await this.auth.login(dto.email, dto.password);
    this.setRefreshCookie(res, tokens);
    return { accessToken: tokens.accessToken };
  }

  @Public()
  @Post("refresh")
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const raw = req.cookies?.[REFRESH_COOKIE];
    if (!raw) throw new UnauthorizedException("No refresh token");

    const tokens = await this.auth.refresh(raw);
    this.setRefreshCookie(res, tokens);
    return { accessToken: tokens.accessToken };
  }

  @Public()
  @Post("logout")
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const raw = req.cookies?.[REFRESH_COOKIE];
    if (raw) await this.auth.logout(raw);
    res.clearCookie(REFRESH_COOKIE, { path: REFRESH_COOKIE_PATH });
    return { success: true };
  }

  @Public()
  @Post("accept-invite")
  async acceptInvite(@Body() dto: AcceptInviteDto, @Res({ passthrough: true }) res: Response) {
    const tokens = await this.auth.acceptInvite(dto.token, dto.password);
    this.setRefreshCookie(res, tokens);
    return { accessToken: tokens.accessToken };
  }

  @Get("me")
  async me(@CurrentUser() user: AuthenticatedUser) {
    const [schools, teacher, guardian, student, self] = await Promise.all([
      this.prisma.school.findMany({
        where: { id: { in: user.schoolIds } },
        select: { id: true, name: true },
      }),
      this.prisma.teacher.findFirst({ where: { userId: user.id }, select: { id: true } }),
      this.prisma.guardian.findFirst({ where: { userId: user.id }, select: { id: true } }),
      this.prisma.student.findFirst({ where: { userId: user.id }, select: { id: true } }),
      this.prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: { mustChangePassword: true } }),
    ]);
    return {
      ...user,
      schools,
      teacherId: teacher?.id ?? null,
      guardianId: guardian?.id ?? null,
      studentId: student?.id ?? null,
      mustChangePassword: self.mustChangePassword,
    };
  }

  @Post("change-password")
  async changePassword(@CurrentUser() user: AuthenticatedUser, @Body() dto: ChangePasswordDto) {
    await this.auth.changeMyPassword(user.id, dto.currentPassword, dto.newPassword);
    return { success: true };
  }

  private setRefreshCookie(res: Response, tokens: TokenPair) {
    res.cookie(REFRESH_COOKIE, tokens.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: REFRESH_COOKIE_PATH,
      expires: tokens.refreshTokenExpiresAt,
    });
  }
}
