import type { PrismaService } from "../prisma/prisma.service";
import type { AuthenticatedUser } from "./types/authenticated-user";

// The one place a raw user id becomes a full AuthenticatedUser (roles,
// permissions, schoolIds resolved) — used by JwtAuthGuard for every
// authenticated request, and by AuthService to build the same shape for
// login/logout audit events, which happen just outside (or right at the
// edge of) the normal request-guard flow.
export async function resolveAuthenticatedUser(
  prisma: PrismaService,
  userId: string,
): Promise<AuthenticatedUser | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      roles: { include: { role: { include: { permissions: { include: { permission: true } } } } } },
      schools: true,
    },
  });
  if (!user) return null;

  const roles = user.roles.map((ur) => ur.role.name);
  const permissions = new Set<string>();
  for (const ur of user.roles) {
    for (const rp of ur.role.permissions) {
      permissions.add(rp.permission.key);
    }
  }

  return {
    id: user.id,
    email: user.email,
    organizationId: user.organizationId,
    roles,
    permissions: Array.from(permissions),
    schoolIds: user.schools.map((s) => s.schoolId),
  };
}
