import { ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { randomBytes, createHash } from "node:crypto";
import { Prisma } from "@school-erp/database";
import { PrismaService } from "../prisma/prisma.service";
import type { AuthenticatedUser } from "../auth/types/authenticated-user";
import { CreateSchoolDto } from "./dto/create-school.dto";

const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

@Injectable()
export class SchoolsService {
  constructor(private readonly prisma: PrismaService) {}

  // Every query here is scoped to the caller's organization, and further
  // restricted to their specific schools when they have any — this is the
  // service-layer half of tenant isolation (see architecture blueprint,
  // section E). A School Admin can never see another school by guessing an ID.
  private accessibleWhere(actor: AuthenticatedUser): Prisma.SchoolWhereInput {
    if (!actor.organizationId) {
      throw new ForbiddenException("This account isn't attached to an organization");
    }
    const where: Prisma.SchoolWhereInput = { organizationId: actor.organizationId };
    if (actor.schoolIds.length > 0) {
      where.id = { in: actor.schoolIds };
    }
    return where;
  }

  async findAccessible(actor: AuthenticatedUser) {
    return this.prisma.school.findMany({
      where: this.accessibleWhere(actor),
      orderBy: { createdAt: "desc" },
    });
  }

  async findOneAccessibleOrThrow(actor: AuthenticatedUser, id: string) {
    // AND, not spread: accessibleWhere() may itself set `id: { in: [...] }`,
    // and spreading `{ ...accessibleWhere(actor), id }` would let the plain
    // `id` key silently overwrite that restriction instead of narrowing it.
    const school = await this.prisma.school.findFirst({
      where: { AND: [this.accessibleWhere(actor), { id }] },
    });
    if (!school) throw new NotFoundException("School not found");
    return school;
  }

  async listDivisions(actor: AuthenticatedUser, schoolId: string) {
    await this.findOneAccessibleOrThrow(actor, schoolId);
    return this.prisma.division.findMany({ where: { schoolId }, orderBy: { type: "asc" } });
  }

  async create(actor: AuthenticatedUser, dto: CreateSchoolDto) {
    if (!actor.organizationId) {
      throw new ForbiddenException("This account isn't attached to an organization");
    }

    const divisionTypes = dto.type === "PRIMARY_AND_SECONDARY" ? (["PRIMARY", "SECONDARY"] as const) : ([dto.type] as const);

    try {
      return await this.prisma.$transaction(async (tx) => {
        // Creating a school produces the school + its division(s) implied by
        // the chosen type — nothing else. No classes, sections, teachers,
        // students, or parents get created here; that's the School Admin's
        // job once they've been invited.
        const school = await tx.school.create({
          data: {
            organizationId: actor.organizationId!,
            name: dto.name,
            type: dto.type,
            address: dto.address,
            phone: dto.phone,
            email: dto.email,
          },
        });

        await tx.division.createMany({
          data: divisionTypes.map((type) => ({ schoolId: school.id, type })),
        });

        await tx.auditLog.create({
          data: {
            organizationId: actor.organizationId,
            schoolId: school.id,
            actorUserId: actor.id,
            action: "school.create",
            resource: "School",
            resourceId: school.id,
            after: { name: school.name, type: school.type },
          },
        });

        return school;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictException("A school with this name already exists in your organization");
      }
      throw error;
    }
  }

  async inviteAdmin(actor: AuthenticatedUser, schoolId: string, email: string) {
    const school = await this.findOneAccessibleOrThrow(actor, schoolId);

    const existingUser = await this.prisma.user.findUnique({ where: { email } });
    if (existingUser?.status === "ACTIVE") {
      throw new ConflictException("A user with this email already has an active account");
    }

    const role = await this.prisma.role.findUniqueOrThrow({ where: { name: "SCHOOL_ADMIN" } });

    const user = await this.prisma.user.upsert({
      where: { email },
      update: {},
      create: { email, organizationId: school.organizationId, status: "PENDING_SETUP" },
    });

    await this.prisma.userRole.upsert({
      where: { userId_roleId: { userId: user.id, roleId: role.id } },
      update: {},
      create: { userId: user.id, roleId: role.id },
    });

    await this.prisma.userSchool.upsert({
      where: { userId_schoolId: { userId: user.id, schoolId: school.id } },
      update: {},
      create: { userId: user.id, schoolId: school.id },
    });

    const rawToken = randomBytes(32).toString("hex");
    await this.prisma.invitation.create({
      data: {
        organizationId: school.organizationId,
        schoolId: school.id,
        roleId: role.id,
        userId: user.id,
        invitedByUserId: actor.id,
        tokenHash: hashToken(rawToken),
        expiresAt: new Date(Date.now() + INVITATION_TTL_MS),
      },
    });

    await this.prisma.auditLog.create({
      data: {
        organizationId: school.organizationId,
        schoolId: school.id,
        actorUserId: actor.id,
        action: "school_admin.invite",
        resource: "User",
        resourceId: user.id,
        after: { email },
      },
    });

    const webOrigin = process.env.WEB_ORIGIN ?? "http://localhost:3010";
    return { email, acceptUrl: `${webOrigin}/accept-invite?token=${rawToken}` };
  }
}
