// Detects "this delete was blocked by an onDelete: Restrict relation" —
// used everywhere a delete is expected to fail cleanly when real child rows
// (students, teachers, etc.) still reference the row being removed.
//
// This can't be a plain `error instanceof Prisma.PrismaClientKnownRequestError
// && error.code === "P2003"` check, because that only covers *some* Postgres
// versions. Local dev's Postgres reports a RESTRICT violation as SQLSTATE
// 23503 (generic "foreign_key_violation"), which Prisma maps to the known
// code P2003 — but Neon's Postgres (production) reports the more specific
// SQLSTATE 23001 ("restrict_violation") for the exact same constraint, which
// has no entry in Prisma's known-error table at all. Prisma then throws a
// PrismaClientUnknownRequestError with no `.code`, and the P2003-only check
// silently falls through to an unhandled 500 — confirmed live in production
// (see SchoolsService.remove). Matching the query engine's own message text
// for the 23001 case is what actually works across both.
export function isRestrictedForeignKeyError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const err = error as { code?: unknown; message?: unknown };

  if (err.code === "P2003") return true;

  return typeof err.message === "string" && err.message.includes("violates RESTRICT setting of foreign key constraint");
}
