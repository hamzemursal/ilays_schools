import { Body, Controller, Get, Post, Res } from "@nestjs/common";
import type { Response } from "express";
import { TotpService } from "./totp.service";
import { EnableTotpDto } from "./dto/enable-totp.dto";
import { DisableTotpDto } from "./dto/disable-totp.dto";
import { VerifyLoginTotpDto } from "./dto/verify-login-totp.dto";
import { Public } from "../auth/decorators/public.decorator";
import { AllowTotpSetupRequired } from "../auth/decorators/allow-totp-setup-required.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import type { AuthenticatedUser } from "../auth/types/authenticated-user";

// setRefreshCookie/REFRESH_COOKIE_OPTIONS duplicate a small slice of
// AuthController's own cookie handling — verify-login is the one place
// outside AuthController that ever completes a login and needs to set that
// cookie. Not worth extracting into a shared helper for one call site.
const REFRESH_COOKIE_PREFIX = "refresh_token_";
const REFRESH_COOKIE_PATH = "/api/v1/auth";
const isCrossSiteDeployment = process.env.NODE_ENV === "production";
const REFRESH_COOKIE_OPTIONS = {
  path: REFRESH_COOKIE_PATH,
  httpOnly: true,
  secure: isCrossSiteDeployment,
  sameSite: (isCrossSiteDeployment ? "none" : "lax") as "none" | "lax",
};

@Controller("auth/totp")
export class TotpController {
  constructor(private readonly totp: TotpService) {}

  @AllowTotpSetupRequired()
  @Get("status")
  async status(@CurrentUser() user: AuthenticatedUser) {
    return this.totp.status(user.id);
  }

  @AllowTotpSetupRequired()
  @Post("setup")
  async setup(@CurrentUser() user: AuthenticatedUser) {
    return this.totp.setup(user.id);
  }

  @AllowTotpSetupRequired()
  @Post("enable")
  async enable(@CurrentUser() user: AuthenticatedUser, @Body() dto: EnableTotpDto) {
    return this.totp.enable(user.id, dto);
  }

  @Post("disable")
  async disable(@CurrentUser() user: AuthenticatedUser, @Body() dto: DisableTotpDto) {
    return this.totp.disable(user.id, dto);
  }

  // No real access token exists yet at this point in the login flow — only
  // the short-lived mfaToken from AuthService.login(), verified inside
  // TotpService.verifyLogin itself against JWT_MFA_SECRET.
  @Public()
  @Post("verify-login")
  async verifyLogin(@Body() dto: VerifyLoginTotpDto, @Res({ passthrough: true }) res: Response) {
    const tokens = await this.totp.verifyLogin(dto);
    res.cookie(`${REFRESH_COOKIE_PREFIX}${tokens.sessionId}`, tokens.refreshToken, {
      ...REFRESH_COOKIE_OPTIONS,
      expires: tokens.refreshTokenExpiresAt,
    });
    return { accessToken: tokens.accessToken, sessionId: tokens.sessionId };
  }
}
