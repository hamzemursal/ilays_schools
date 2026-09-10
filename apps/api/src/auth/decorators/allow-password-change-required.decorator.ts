import { SetMetadata } from "@nestjs/common";

export const ALLOW_PASSWORD_CHANGE_REQUIRED_KEY = "allowPasswordChangeRequired";

// Marks a route as reachable even when the caller's account has
// mustChangePassword set — otherwise JwtAuthGuard blocks every route for
// such an account until the password is changed (see AppShell's matching
// frontend gate, which this backs up: the frontend check alone never
// stopped a direct API call). Only the two routes needed to actually clear
// the flag carry this — GET /auth/me (so the frontend can render the gate)
// and POST /auth/change-password (the only way to clear it).
export const AllowPasswordChangeRequired = () => SetMetadata(ALLOW_PASSWORD_CHANGE_REQUIRED_KEY, true);
