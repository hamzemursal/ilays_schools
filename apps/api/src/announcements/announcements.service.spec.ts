import type { AuthenticatedUser } from "../auth/types/authenticated-user";
import { AnnouncementsService } from "./announcements.service";
import { PrismaService } from "../prisma/prisma.service";
import { SchoolsService } from "../schools/schools.service";
import type { CreateAnnouncementDto } from "./dto/create-announcement.dto";

const ACTOR: AuthenticatedUser = {
  id: "admin-1",
  email: "admin@example.com",
  organizationId: "org-1",
  roles: ["SCHOOL_ADMIN"],
  permissions: ["announcements.create"],
  schoolIds: ["school-1"],
};

type MockPrisma = {
  announcement: { findMany: jest.Mock; create: jest.Mock };
  guardian: { findMany: jest.Mock };
  notification: { createMany: jest.Mock };
  $transaction: jest.Mock;
};

function createMockPrisma(): MockPrisma {
  const prisma: Partial<MockPrisma> = {
    announcement: { findMany: jest.fn(), create: jest.fn() },
    guardian: { findMany: jest.fn() },
    notification: { createMany: jest.fn() },
  };
  prisma.$transaction = jest.fn((cb: (tx: unknown) => unknown) => cb(prisma));
  return prisma as MockPrisma;
}

function createService(prisma: MockPrisma) {
  const schools = { findOneAccessibleOrThrow: jest.fn().mockResolvedValue(undefined) };
  const service = new AnnouncementsService(prisma as unknown as PrismaService, schools as unknown as SchoolsService);
  return { service, schools };
}

function dto(overrides: Partial<CreateAnnouncementDto> = {}): CreateAnnouncementDto {
  return { title: "School closed Friday", body: "Due to weather.", ...overrides };
}

describe("AnnouncementsService.listForSchool", () => {
  it("checks school access before listing", async () => {
    const prisma = createMockPrisma();
    prisma.announcement.findMany.mockResolvedValue([]);
    const { service, schools } = createService(prisma);

    await service.listForSchool(ACTOR, "school-1");

    expect(schools.findOneAccessibleOrThrow).toHaveBeenCalledWith(ACTOR, "school-1");
  });

  it("scopes to the given school, newest first", async () => {
    const prisma = createMockPrisma();
    prisma.announcement.findMany.mockResolvedValue([]);
    const { service } = createService(prisma);

    await service.listForSchool(ACTOR, "school-1");

    expect(prisma.announcement.findMany).toHaveBeenCalledWith({
      where: { schoolId: "school-1" },
      orderBy: { createdAt: "desc" },
    });
  });
});

describe("AnnouncementsService.create — notification fan-out", () => {
  let prisma: MockPrisma;
  let service: AnnouncementsService;

  beforeEach(() => {
    prisma = createMockPrisma();
    ({ service } = createService(prisma));
    prisma.announcement.create.mockResolvedValue({ id: "ann-1", title: "School closed Friday", body: "Due to weather." });
  });

  it("defaults the audience to ALL when none is given", async () => {
    prisma.guardian.findMany.mockResolvedValue([]);
    await service.create(ACTOR, "school-1", dto());
    expect(prisma.announcement.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ audience: "ALL" }) }),
    );
  });

  it("fans out to every ACTIVE guardian with an actively-enrolled child at this school when audience is ALL", async () => {
    prisma.guardian.findMany.mockResolvedValue([{ id: "g1" }, { id: "g2" }]);

    await service.create(ACTOR, "school-1", dto({ audience: "ALL" as never }));

    expect(prisma.guardian.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          status: "ACTIVE",
          students: { some: { status: "ACTIVE", student: { enrollments: { some: { schoolId: "school-1", status: "ACTIVE" } } } } },
        },
      }),
    );
    expect(prisma.notification.createMany).toHaveBeenCalledWith({
      data: [
        { guardianId: "g1", announcementId: "ann-1", title: "School closed Friday", body: "Due to weather." },
        { guardianId: "g2", announcementId: "ann-1", title: "School closed Friday", body: "Due to weather." },
      ],
    });
  });

  it("also fans out for audience PARENTS", async () => {
    prisma.guardian.findMany.mockResolvedValue([{ id: "g1" }]);
    await service.create(ACTOR, "school-1", dto({ audience: "PARENTS" as never }));
    expect(prisma.notification.createMany).toHaveBeenCalled();
  });

  it("never queries guardians or creates notifications for audience TEACHERS", async () => {
    await service.create(ACTOR, "school-1", dto({ audience: "TEACHERS" as never }));
    expect(prisma.guardian.findMany).not.toHaveBeenCalled();
    expect(prisma.notification.createMany).not.toHaveBeenCalled();
  });

  it("skips the createMany call entirely when no guardian matches, rather than writing an empty batch", async () => {
    prisma.guardian.findMany.mockResolvedValue([]);
    await service.create(ACTOR, "school-1", dto());
    expect(prisma.notification.createMany).not.toHaveBeenCalled();
  });

  it("creates the announcement, guardian lookup, and notification fan-out all inside one transaction", async () => {
    prisma.guardian.findMany.mockResolvedValue([{ id: "g1" }]);
    await service.create(ACTOR, "school-1", dto());
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it("stamps createdByUserId from the actor", async () => {
    prisma.guardian.findMany.mockResolvedValue([]);
    await service.create(ACTOR, "school-1", dto());
    expect(prisma.announcement.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ createdByUserId: "admin-1" }) }),
    );
  });

  it("returns the created announcement", async () => {
    prisma.guardian.findMany.mockResolvedValue([]);
    const result = await service.create(ACTOR, "school-1", dto());
    expect(result).toEqual({ id: "ann-1", title: "School closed Friday", body: "Due to weather." });
  });
});
