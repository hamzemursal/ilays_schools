import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { SchoolsService } from "../schools/schools.service";
import type { AuthenticatedUser } from "../auth/types/authenticated-user";
import { CreateAnnouncementDto } from "./dto/create-announcement.dto";

@Injectable()
export class AnnouncementsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly schools: SchoolsService,
  ) {}

  async listForSchool(actor: AuthenticatedUser, schoolId: string) {
    await this.schools.findOneAccessibleOrThrow(actor, schoolId);
    return this.prisma.announcement.findMany({
      where: { schoolId },
      orderBy: { createdAt: "desc" },
    });
  }

  // Fans an announcement out to a Notification row per guardian with an
  // actively-enrolled child at this school, when the audience includes
  // parents — this is the only place Notification rows are produced today.
  async create(actor: AuthenticatedUser, schoolId: string, dto: CreateAnnouncementDto) {
    await this.schools.findOneAccessibleOrThrow(actor, schoolId);

    const audience = dto.audience ?? "ALL";

    return this.prisma.$transaction(async (tx) => {
      const announcement = await tx.announcement.create({
        data: {
          schoolId,
          title: dto.title,
          body: dto.body,
          audience,
          createdByUserId: actor.id,
        },
      });

      if (audience === "ALL" || audience === "PARENTS") {
        const guardians = await tx.guardian.findMany({
          where: {
            status: "ACTIVE",
            students: {
              some: { status: "ACTIVE", student: { enrollments: { some: { schoolId, status: "ACTIVE" } } } },
            },
          },
          select: { id: true },
        });

        if (guardians.length > 0) {
          await tx.notification.createMany({
            data: guardians.map((g) => ({
              guardianId: g.id,
              announcementId: announcement.id,
              title: announcement.title,
              body: announcement.body,
            })),
          });
        }
      }

      return announcement;
    });
  }
}
