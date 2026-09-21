import { ConflictException, ForbiddenException, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@school-erp/database";
import { randomBytes } from "node:crypto";
import * as argon2 from "argon2";

type Db = Pick<Prisma.TransactionClient, "user">;
type Tx = Prisma.TransactionClient;

// Shared by the Student and Parent portal password reset. A reset only ever
// UPDATES the one existing User row (password hash, mustChangePassword, and
// its sessions) - it never creates a User, Student, Guardian, role,
// school-membership or student-parent link, and never touches an id.
//
// CURRENT BEHAVIOUR (intentional, documented): both Student and Parent resets
// issue an admin-relayed TEMPORARY PASSWORD, shown once to the admin, stored
// only as an argon2id hash, never logged or audited, and forced to be changed
// at next login (mustChangePassword). Parents are not sent a reset LINK
// because this system has no outbound email yet - the existing parent invite
// flow already works the same way (the admin copies the accept-invite URL).
// Once email delivery exists, a parent reset can become an emailed one-time
// link with no change to the safety rules below.

// An admin-issued temporary password. Shown to the admin exactly once (the
// response), stored only as an argon2id hash, and never passed to the audit
// log.
export async function createTemporaryCredentials(): Promise<{ temporaryPassword: string; passwordHash: string }> {
  const temporaryPassword = randomBytes(9).toString("base64url");
  const passwordHash = await argon2.hash(temporaryPassword, { type: argon2.argon2id });
  return { temporaryPassword, passwordHash };
}

// The portal account being reset must be exactly what the caller thinks it is.
// A Guardian/Student row can point at a User that also holds another role (a
// teacher or admin who is also a parent, say) - resetting THAT password from
// a school-level "reset parent" action would be a privilege escalation, so
// such an account is refused outright rather than reset.
export async function assertResettablePortalUser(
  db: Db,
  userId: string,
  role: "STUDENT" | "PARENT",
  organizationId: string | null,
) {
  const user = await db.user.findUnique({
    where: { id: userId },
    include: { roles: { include: { role: true } } },
  });
  if (!user || user.organizationId !== organizationId) {
    throw new NotFoundException("Portal account not found");
  }

  const roleNames = user.roles.map((r) => r.role.name);
  if (roleNames.length === 0 || roleNames.some((name) => name !== role)) {
    throw new ForbiddenException("This login also holds other roles, so its password can't be reset from here");
  }
  if (user.status === "SUSPENDED") {
    throw new ConflictException("This portal account is suspended - reactivate it before resetting the password");
  }
  return user;
}

// Writes the new credentials onto the existing account:
// - mustChangePassword stays enforced: the holder must choose their own
//   password at next login (JwtAuthGuard blocks everything else until then);
// - every live session is revoked, so an old login can't outlive the reset;
// - a still-pending invite link is revoked, so it can't overwrite the reset;
// - a parent who never finished invite setup (PENDING_SETUP) becomes ACTIVE,
//   since the admin has now issued them working credentials.
export async function applyTemporaryPassword(tx: Tx, userId: string, passwordHash: string) {
  await tx.user.update({
    where: { id: userId },
    data: { passwordHash, mustChangePassword: true, status: "ACTIVE" },
  });
  const sessions = await tx.refreshToken.updateMany({ where: { userId, revoked: false }, data: { revoked: true } });
  await tx.invitation.updateMany({ where: { userId, status: "PENDING" }, data: { status: "REVOKED" } });
  return { sessionsRevoked: sessions.count };
}
