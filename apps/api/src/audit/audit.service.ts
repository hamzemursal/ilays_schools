import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { SchoolsService } from "../schools/schools.service";
import type { AuthenticatedUser } from "../auth/types/authenticated-user";

@Injectable()
export class AuditService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly schools: SchoolsService,
  ) {}

  // actorUserId is a plain string column, not a Prisma relation (audit
  // entries must survive the actor's user record changing or even being
  // gone), so actor emails are resolved with a separate batched lookup
  // rather than an `include`.
  async listForSchool(actor: AuthenticatedUser, schoolId: string, action?: string) {
    await this.schools.findOneAccessibleOrThrow(actor, schoolId);

    const logs = await this.prisma.auditLog.findMany({
      where: { schoolId, ...(action ? { action } : {}) },
      orderBy: { createdAt: "desc" },
      take: 200,
    });

    const actorIds = [...new Set(logs.map((l) => l.actorUserId).filter((id): id is string => !!id))];
    const users = await this.prisma.user.findMany({
      where: { id: { in: actorIds } },
      select: { id: true, email: true },
    });
    const emailById = new Map(users.map((u) => [u.id, u.email]));

    return logs.map((l) => ({
      ...l,
      actorEmail: l.actorUserId ? (emailById.get(l.actorUserId) ?? "(deleted user)") : "(system)",
    }));
  }
}
