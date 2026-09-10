import { SetMetadata } from "@nestjs/common";

export const ALLOW_TOTP_SETUP_REQUIRED_KEY = "allowTotpSetupRequired";

// Marks a route as reachable even when the caller's account is required to
// have 2FA enabled but doesn't yet (SUPER_ADMIN/ORGANIZATION_ADMIN with
// totpEnabledAt null — see JwtAuthGuard and Part K's "required for Super/Org
// Admins" spec). Same shape as AllowPasswordChangeRequired, checked after
// it: only the routes actually needed to complete setup carry this — GET
// /auth/me (so AppShell's matching frontend gate can render), POST
// /auth/logout (so a stuck admin can always back out to a different
// account), and the /auth/totp/setup|enable|status trio that setup itself
// needs.
export const AllowTotpSetupRequired = () => SetMetadata(ALLOW_TOTP_SETUP_REQUIRED_KEY, true);
