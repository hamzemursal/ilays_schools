// Defense-in-depth for AuditLog.before/after/reason — none of this codebase's
// ~30 audit call sites currently pass secrets in, but this makes it
// structurally impossible for a future one to leak a password/token into a
// permanent, otherwise-immutable record. Matches by substring so
// "passwordHash", "newPassword", "refreshToken", etc. all get caught, not
// just exact key names.
const SENSITIVE_KEY_PATTERN =
  /password|passwordhash|token|secret|apikey|api_key|databaseurl|database_url|authorization|cookie|cloudinary/i;

const REDACTED = "[REDACTED]";
const MAX_DEPTH = 5;

export function sanitizeForAudit<T>(value: T, depth = 0): T {
  if (value === null || value === undefined || depth >= MAX_DEPTH) return value;

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeForAudit(item, depth + 1)) as unknown as T;
  }

  if (typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      result[key] = SENSITIVE_KEY_PATTERN.test(key) ? REDACTED : sanitizeForAudit(val, depth + 1);
    }
    return result as T;
  }

  return value;
}
