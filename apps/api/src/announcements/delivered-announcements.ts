import type { Prisma } from "@school-erp/database";
import type { PrismaService } from "../prisma/prisma.service";

// Announcements actually delivered to this person — read from their own
// Notification rows, the single source of truth shared with the topbar bell,
// so an announcement page and the bell can never disagree. A parent's rows
// may carry only guardianId (older rows, or a parent without a login at the
// time), so both keys are matched.
export async function deliveredAnnouncements(prisma: PrismaService, userId: string, guardianId?: string | null) {
  const owner: Prisma.NotificationWhereInput[] = [{ userId }];
  if (guardianId) owner.push({ guardianId });
  const rows = await prisma.notification.findMany({
    where: { announcementId: { not: null }, OR: owner },
    select: { announcement: { include: { school: { select: { name: true } } } } },
    orderBy: { createdAt: "desc" },
  });
  const seen = new Set<string>();
  const out: NonNullable<(typeof rows)[number]["announcement"]>[] = [];
  for (const r of rows) {
    if (r.announcement && !seen.has(r.announcement.id)) {
      seen.add(r.announcement.id);
      out.push(r.announcement);
    }
  }
  return out;
}

// Merges delivered and legacy (created before audience delivery, shown by
// the old view-time rule) announcements into one newest-first list.
export function mergeAnnouncements<T extends { id: string; createdAt: Date }>(...lists: T[][]): T[] {
  const byId = new Map<string, T>();
  for (const list of lists) for (const a of list) byId.set(a.id, a);
  return [...byId.values()].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}
