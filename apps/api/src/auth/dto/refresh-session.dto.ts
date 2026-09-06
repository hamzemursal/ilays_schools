import { IsOptional, IsUUID } from "class-validator";

// Which login session (RefreshToken row id) a refresh/logout call means.
// Optional so an old cached frontend bundle — or a brand-new tab that never
// got one — can still fall back to the legacy single shared cookie; see
// AuthController's REFRESH_COOKIE_LEGACY_NAME.
export class RefreshSessionDto {
  @IsOptional()
  @IsUUID()
  sessionId?: string;
}
