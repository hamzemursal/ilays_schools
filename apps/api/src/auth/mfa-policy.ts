// Single source of truth for whether 2FA/MFA is actually enforced anywhere
// in the login flow. Everything the TOTP feature is built from (TotpService,
// TotpController, the /auth/totp/* endpoints, recovery codes, the
// encryption util, the Account Settings UI, and every 2FA-related database
// field) stays fully intact and usable regardless of this flag — flipping
// it back to `true` is the ONLY change needed to restore full enforcement:
//   - AuthService.login(): whether a TOTP-enabled account gets an MFA
//     challenge instead of real tokens.
//   - JwtAuthGuard: whether SUPER_ADMIN/ORGANIZATION_ADMIN accounts are
//     blocked from every protected route until they enroll in TOTP.
//   - AuthController.me(): the mustSetup2FA flag the frontend reads to
//     decide whether to force the enrollment screen (kept consistent with
//     the guard above on purpose — see its own call site for why).
//
// Disabled for now per explicit product decision (2026-09-23): normal login
// is Email + Password -> dashboard, for every role, with no Authentication
// Code step and no forced enrollment screen.
export const MFA_LOGIN_ENFORCED = false;
