import { BadRequestException } from "@nestjs/common";
import type { AuthenticatedUser } from "../auth/types/authenticated-user";
import { AnnouncementsService } from "./announcements.service";
import { AnnouncementAudienceService } from "./announcement-audience.service";
import { PrismaService } from "../prisma/prisma.service";
import { SchoolsService } from "../schools/schools.service";
import type { CreateAnnouncementDto } from "./dto/create-announcement.dto";

// Unit tests of the service's own wiring (access check, stored delivery,
// transaction). Who each audience reaches is proven against a real database
// in announcement-audience.integration.spec.ts.

const ACTOR: AuthenticatedUser = {
  id: "admin-1",
  email: "admin@example.com",
  organizationId: "org-1",
  roles: ["SCHOOL_ADMIN"],
  permissions: ["announcements.manage"],
  schoolIds: ["school-1"],
};

type MockPrisma = {
  announcement: { findMany: jest.Mock; create: jest.Mock };
  guardian: { findFirst: jest.Mock };
  notification: { createMany: jest.Mock; findMany: jest.Mock };
  $transaction: jest.Mock;
};

function createMockPrisma(): MockPrisma {
  const prisma: Partial<MockPrisma> = {
    announcement: { findMany: jest.fn(), create: jest.fn() },
    guardian: { findFirst: jest.fn() },
    notification: { createMany: jest.fn(), findMany: jest.fn() },
  };
  prisma.$transaction = jest.fn((cb: (tx: unknown) => unknown) => cb(prisma));
  return prisma as MockPrisma;
}

function createService(prisma: MockPrisma) {
  const schools = { findOneAccessibleOrThrow: jest.fn().mockResolvedValue(undefined) };
  const audience = {
    validate: jest.fn().mockResolvedValue(undefined),
    resolve: jest.fn().mockResolvedValue({ userIds: new Set(["u1"]), guardians: new Map([["g1", "u2"]]) }),
    toNotificationRows: jest.fn().mockReturnValue([{ guardianId: "g1", userId: "u2" }, { userId: "u1" }]),
  };
  const service = new AnnouncementsService(
    prisma as unknown as PrismaService,
    schools as unknown as SchoolsService,
    audience as unknown as AnnouncementAudienceService,
  );
  return { service, schools, audience };
}

function dto(overrides: Partial<CreateAnnouncementDto> = {}): CreateAnnouncementDto {
  return { title: "School closed Friday", body: "Due to weather.", ...overrides };
}

describe("AnnouncementsService.listForSchool", () => {
  it("checks school access, scopes to the school, newest first, with a delivered count", async () => {
    const prisma = createMockPrisma();
    prisma.announcement.findMany.mockResolvedValue([
      { id: "a1", deliveredAt: new Date(), _count: { notifications: 3 } },
      { id: "a0", deliveredAt: null, _count: { notifications: 1 } },
    ]);
    const { service, schools } = createService(prisma);

    const result = await service.listForSchool(ACTOR, "school-1");

    expect(schools.findOneAccessibleOrThrow).toHaveBeenCalledWith(ACTOR, "school-1");
    expect(prisma.announcement.findMany.mock.calls[0][0]).toMatchObject({ where: { schoolId: "school-1" }, orderBy: { createdAt: "desc" } });
    expect(result.map((a) => a.recipientCount)).toEqual([3, null]);
  });
});

describe("AnnouncementsService.create — stored delivery", () => {
  let prisma: MockPrisma;
  let service: AnnouncementsService;
  let schools: { findOneAccessibleOrThrow: jest.Mock };
  let audience: { validate: jest.Mock; resolve: jest.Mock; toNotificationRows: jest.Mock };

  beforeEach(() => {
    prisma = createMockPrisma();
    ({ service, schools, audience } = createService(prisma));
    prisma.announcement.create.mockResolvedValue({ id: "ann-1", title: "School closed Friday", body: "Due to weather." });
  });

  it("checks school access first and defaults the audience to ALL", async () => {
    await service.create(ACTOR, "school-1", dto());
    expect(schools.findOneAccessibleOrThrow).toHaveBeenCalledWith(ACTOR, "school-1");
    expect(prisma.announcement.create.mock.calls[0][0].data).toMatchObject({ audience: "ALL", createdByUserId: "admin-1" });
  });

  it("validates the target inside the transaction before creating anything", async () => {
    audience.validate.mockRejectedValue(new BadRequestException("Class not found in this school and academic year"));
    await expect(service.create(ACTOR, "school-1", dto({ audience: "CURRENT_STUDENTS" }))).rejects.toThrow(BadRequestException);
    expect(prisma.announcement.create).not.toHaveBeenCalled();
    expect(prisma.notification.createMany).not.toHaveBeenCalled();
  });

  it("stores the scope and marks the announcement delivered", async () => {
    await service.create(ACTOR, "school-1", dto({ audience: "PARENTS", academicYearId: "y1", classId: "c1", sectionId: "s1" }));
    const data = prisma.announcement.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ audience: "PARENTS", academicYearId: "y1", classId: "c1", sectionId: "s1" });
    expect(data.deliveredAt).toBeInstanceOf(Date);
  });

  it("writes one Notification per resolved person, skipping duplicates", async () => {
    await service.create(ACTOR, "school-1", dto());
    expect(prisma.notification.createMany).toHaveBeenCalledWith({
      data: [
        { guardianId: "g1", userId: "u2", announcementId: "ann-1", title: "School closed Friday", body: "Due to weather." },
        { userId: "u1", announcementId: "ann-1", title: "School closed Friday", body: "Due to weather." },
      ],
      skipDuplicates: true,
    });
  });

  it("skips the write entirely when nobody matches", async () => {
    audience.toNotificationRows.mockReturnValue([]);
    await service.create(ACTOR, "school-1", dto({ audience: "ALUMNI" }));
    expect(prisma.notification.createMany).not.toHaveBeenCalled();
  });

  it("runs the announcement and its deliveries in one transaction", async () => {
    await service.create(ACTOR, "school-1", dto());
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it("refuses recipients on anything but a Specific People announcement", async () => {
    await expect(service.create(ACTOR, "school-1", dto({ audience: "PARENTS", recipientUserIds: ["u9"] }))).rejects.toThrow(
      /Specific People/,
    );
  });
});

describe("AnnouncementsService.preview / mine", () => {
  it("preview counts the resolved deliveries without writing", async () => {
    const prisma = createMockPrisma();
    const { service } = createService(prisma);
    await expect(service.preview(ACTOR, "school-1", { audience: "ALL" })).resolves.toEqual({ recipients: 2 });
    expect(prisma.notification.createMany).not.toHaveBeenCalled();
    expect(prisma.announcement.create).not.toHaveBeenCalled();
  });

  it("mine reads only the caller's own delivered rows (by user, and by guardian for a parent)", async () => {
    const prisma = createMockPrisma();
    prisma.guardian.findFirst.mockResolvedValue({ id: "g1" });
    prisma.notification.findMany.mockResolvedValue([
      { announcement: { id: "a2", createdAt: new Date("2030-01-02") } },
      { announcement: { id: "a2", createdAt: new Date("2030-01-02") } },
      { announcement: { id: "a1", createdAt: new Date("2030-01-01") } },
    ]);
    const { service } = createService(prisma);

    const result = await service.mine({ ...ACTOR, id: "teacher-1" });

    expect(prisma.notification.findMany.mock.calls[0][0].where).toEqual({
      announcementId: { not: null },
      OR: [{ userId: "teacher-1" }, { guardianId: "g1" }],
    });
    expect(result.map((a) => a.id)).toEqual(["a2", "a1"]);
  });
});
