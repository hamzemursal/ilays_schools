import { BadRequestException, Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { SchoolsService } from "../schools/schools.service";
import type { AuthenticatedUser } from "../auth/types/authenticated-user";
import { AnnouncementTargetDto, CreateAnnouncementDto } from "./dto/create-announcement.dto";
import { AnnouncementAudienceService, type AnnouncementTarget } from "./announcement-audience.service";
import { deliveredAnnouncements } from "./delivered-announcements";

@Injectable()
export class AnnouncementsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly schools: SchoolsService,
    private readonly audience: AnnouncementAudienceService,
  ) {}

  // The management list for people who run announcements — every
  // announcement of the school, labelled with its audience and scope.
  async listForSchool(actor: AuthenticatedUser, schoolId: string) {
    await this.schools.findOneAccessibleOrThrow(actor, schoolId);
    const announcements = await this.prisma.announcement.findMany({
      where: { schoolId },
      include: {
        academicYear: { select: { name: true } },
        class: { select: { name: true } },
        section: { select: { name: true } },
        _count: { select: { notifications: true } },
      },
      orderBy: { createdAt: "desc" },
    });
    return announcements.map(({ _count, ...a }) => ({ ...a, recipientCount: a.deliveredAt ? _count.notifications : null }));
  }

  // Resolves the recipients once and stores one Notification per person.
  // Those rows ARE the delivery: every inbox and the bell read them.
  async create(actor: AuthenticatedUser, schoolId: string, dto: CreateAnnouncementDto) {
    await this.schools.findOneAccessibleOrThrow(actor, schoolId);
    const target = toTarget(schoolId, dto);

    return this.prisma.$transaction(async (tx) => {
      await this.audience.validate(target, tx);

      const announcement = await tx.announcement.create({
        data: {
          schoolId,
          title: dto.title,
          body: dto.body,
          audience: target.audience,
          academicYearId: target.academicYearId ?? null,
          classId: target.classId ?? null,
          sectionId: target.sectionId ?? null,
          createdByUserId: actor.id,
          deliveredAt: new Date(),
        },
      });

      const rows = this.audience.toNotificationRows(await this.audience.resolve(target, tx));
      if (rows.length > 0) {
        await tx.notification.createMany({
          data: rows.map((r) => ({ ...r, announcementId: announcement.id, title: announcement.title, body: announcement.body })),
          skipDuplicates: true,
        });
      }

      return announcement;
    });
  }

  // "Will reach about N people" — the same resolver, without writing.
  async preview(actor: AuthenticatedUser, schoolId: string, dto: AnnouncementTargetDto) {
    await this.schools.findOneAccessibleOrThrow(actor, schoolId);
    const target = toTarget(schoolId, dto);
    await this.audience.validate(target);
    return { recipients: this.audience.toNotificationRows(await this.audience.resolve(target)).length };
  }

  // People of this school an admin can pick for a Specific People
  // announcement. Only people linked to this school ever appear.
  async recipientOptions(actor: AuthenticatedUser, schoolId: string, q?: string) {
    await this.schools.findOneAccessibleOrThrow(actor, schoolId);
    const term = (q ?? "").trim();
    if (term.length < 2) return [];
    const name = {
      OR: [
        { firstName: { contains: term, mode: "insensitive" as const } },
        { lastName: { contains: term, mode: "insensitive" as const } },
      ],
    };
    const [students, guardians, teachers, staff] = await Promise.all([
      this.prisma.student.findMany({
        where: { ...name, userId: { not: null }, enrollments: { some: { schoolId } } },
        select: { userId: true, firstName: true, lastName: true, currentStatus: true },
        take: 10,
      }),
      this.prisma.guardian.findMany({
        where: {
          ...name,
          userId: { not: null },
          students: { some: { status: "ACTIVE", student: { enrollments: { some: { schoolId } } } } },
        },
        select: { userId: true, firstName: true, lastName: true },
        take: 10,
      }),
      this.prisma.teacher.findMany({
        where: { ...name, userId: { not: null }, OR: [{ schoolId }, { assignments: { some: { schoolId } } }] },
        select: { userId: true, firstName: true, lastName: true },
        take: 10,
      }),
      this.prisma.staff.findMany({
        where: { ...name, userId: { not: null }, schoolId },
        select: { userId: true, firstName: true, lastName: true },
        take: 10,
      }),
    ]);
    const options = [
      ...students.map((s) => ({ userId: s.userId!, name: `${s.firstName} ${s.lastName}`, kind: s.currentStatus === "GRADUATED" ? "Alumni" : "Student" })),
      ...guardians.map((g) => ({ userId: g.userId!, name: `${g.firstName} ${g.lastName}`, kind: "Parent" })),
      ...teachers.map((t) => ({ userId: t.userId!, name: `${t.firstName} ${t.lastName}`, kind: "Teacher" })),
      ...staff.map((s) => ({ userId: s.userId!, name: `${s.firstName} ${s.lastName}`, kind: "Staff" })),
    ];
    const seen = new Set<string>();
    return options.filter((o) => !seen.has(o.userId) && seen.add(o.userId));
  }

  // The caller's own delivered announcements (teachers, staff, anyone) —
  // never another person's inbox.
  async mine(actor: AuthenticatedUser) {
    const guardian = await this.prisma.guardian.findFirst({ where: { userId: actor.id }, select: { id: true } });
    return deliveredAnnouncements(this.prisma, actor.id, guardian?.id);
  }
}

function toTarget(schoolId: string, dto: AnnouncementTargetDto): AnnouncementTarget {
  const audience = dto.audience ?? "ALL";
  if (dto.recipientUserIds && audience !== "INDIVIDUAL" && dto.recipientUserIds.length > 0) {
    throw new BadRequestException("Recipients can only be chosen for a Specific People announcement");
  }
  return {
    schoolId,
    audience,
    academicYearId: dto.academicYearId ?? null,
    classId: dto.classId ?? null,
    sectionId: dto.sectionId ?? null,
    recipientUserIds: dto.recipientUserIds,
  };
}
