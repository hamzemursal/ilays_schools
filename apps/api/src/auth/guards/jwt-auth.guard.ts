import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Reflector } from "@nestjs/core";
import { IS_PUBLIC_KEY } from "../decorators/public.decorator";
import { ALLOW_PASSWORD_CHANGE_REQUIRED_KEY } from "../decorators/allow-password-change-required.decorator";
import { ALLOW_TOTP_SETUP_REQUIRED_KEY } from "../decorators/allow-totp-setup-required.decorator";
import { PrismaService } from "../../prisma/prisma.service";
import type { AuthenticatedUser } from "../types/authenticated-user";

// Part K's "Optional TOTP 2FA, required for Super/Org Admins" — these two
// roles are the only ones the mustSetup2FA gate below ever fires for. Every
// other role can still opt in via /auth/totp/setup, just never forced.
export const ROLES_REQUIRING_2FA = ["SUPER_ADMIN", "ORGANIZATION_ADMIN"];

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest();
    const token = this.extractToken(request);
    if (!token) throw new UnauthorizedException("Missing access token");

    let payload: { sub: string };
    try {
      payload = await this.jwt.verifyAsync(token, {
        secret: process.env.JWT_ACCESS_SECRET,
      });
    } catch {
      throw new UnauthorizedException("Invalid or expired access token");
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: {
        roles: { include: { role: { include: { permissions: { include: { permission: true } } } } } },
        schools: true,
      },
    });

    if (!user || user.status !== "ACTIVE") {
      throw new UnauthorizedException("Account is not active");
    }

    const roles = user.roles.map((ur) => ur.role.name);

    // Mirrors AppShell's frontend gate, which only blocks rendering — a
    // direct API call bypassed it entirely until this check existed. Only
    // the two routes the password-change flow itself needs stay reachable.
    if (user.mustChangePassword) {
      const exempt = this.reflector.getAllAndOverride<boolean>(ALLOW_PASSWORD_CHANGE_REQUIRED_KEY, [
        context.getHandler(),
        context.getClass(),
      ]);
      if (!exempt) {
        throw new ForbiddenException("Password must be changed before continuing");
      }
    }

    // Same shape as the mustChangePassword gate above, checked after it —
    // a Super/Org Admin who also happens to need a password change deals
    // with that first. Mirrors AppShell's matching frontend gate.
    if (roles.some((r) => ROLES_REQUIRING_2FA.includes(r)) && !user.totpEnabledAt) {
      const exempt = this.reflector.getAllAndOverride<boolean>(ALLOW_TOTP_SETUP_REQUIRED_KEY, [
        context.getHandler(),
        context.getClass(),
      ]);
      if (!exempt) {
        throw new ForbiddenException("Two-factor authentication must be set up before continuing");
      }
    }

    const permissions = new Set<string>();
    for (const ur of user.roles) {
      for (const rp of ur.role.permissions) {
        permissions.add(rp.permission.key);
      }
    }

    const authenticatedUser: AuthenticatedUser = {
      id: user.id,
      email: user.email,
      organizationId: user.organizationId,
      roles,
      permissions: Array.from(permissions),
      schoolIds: user.schools.map((s) => s.schoolId),
    };

    request.user = authenticatedUser;
    return true;
  }

  private extractToken(request: { headers: Record<string, string | undefined> }): string | null {
    const header = request.headers.authorization;
    if (!header?.startsWith("Bearer ")) return null;
    return header.slice("Bearer ".length);
  }
}
