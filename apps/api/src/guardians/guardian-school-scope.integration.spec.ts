import { NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { SchoolsService } from "../schools/schools.service";
import { GuardiansService } from "./guardians.service";
import type { AuditService } from "../audit/audit.service";
import type { AuthenticatedUser } from "../auth/types/authenticated-user";

// REAL-DATABASE test: a parent added from a school's Parents page with no
// child yet appears in THAT school's list (and search), and nowhere else.
// Runs when DATABASE_URL is set (CI's api job).
const describeWithDb = process.env.DATABASE_URL ? describe : describe.skip;

let dbAvailable = true;
function dbIt(name: string, fn: () => Promise<void> | void) {
  it(name, async () => {
    if (!dbAvailable) {
      console.warn(`[guardian school scope integration] no database reachable - not run: ${name}`);
      return;
    }
    await fn();
  });
}

describeWithDb("Guardians — a new parent with no child belongs to the school that added them (real database)", () => {
  const prisma = new PrismaService();
  const audit = { record: jest.fn().mockResolvedValue(undefined) } as unknown as AuditService;
  const guardians = new GuardiansService(prisma, new SchoolsService(prisma, audit), audit);

  const tag = `gs${Date.now().toString(36)}`;
  let orgId: string;
  let schoolA: string;
  let schoolB: string;
  let actor: AuthenticatedUser;

  beforeAll(async () => {
    try {
      await prisma.$connect();
    } catch (error) {
      if (process.env.CI) throw error;
      dbAvailable = false;
      return;
    }
    const org = await prisma.organization.create({ data: { name: `Org ${tag}` } });
    orgId = org.id;
    schoolA = (await prisma.school.create({ data: { organizationId: orgId, name: `A ${tag}`, type: "SECONDARY" } })).id;
    schoolB = (await prisma.school.create({ data: { organizationId: orgId, name: `B ${tag}`, type: "SECONDARY" } })).id;
    actor = { id: "it-admin", email: "a@it.test", organizationId: orgId, roles: ["SUPER_ADMIN"], permissions: [], schoolIds: [] };
  }, 60_000);

  afterAll(async () => {
    if (!dbAvailable) return;
    try {
      await prisma.guardian.deleteMany({ where: { lastName: tag } });
      await prisma.school.deleteMany({ where: { organizationId: orgId } });
      await prisma.organization.deleteMany({ where: { id: orgId } });
    } catch {
      /* leftovers are harmless: every name carries a unique tag */
    } finally {
      await prisma.$disconnect();
    }
  }, 60_000);

  dbIt("shows in school A's list as No Linked Student, is openable and searchable there — and invisible to school B", async () => {
    const created = await guardians.create(actor, schoolA, { firstName: "Vvvvv", lastName: tag, phone: `09${Date.now()}` });
    expect(created.createdInSchoolId).toBe(schoolA);

    const listA = await guardians.list(actor, schoolA);
    const row = listA.find((g) => g.id === created.id);
    expect(row).toMatchObject({ studentAccess: "NO_LINKED_STUDENT", activeChildren: 0, formerChildren: 0 });
    await expect(guardians.getOne(actor, schoolA, created.id)).resolves.toMatchObject({ id: created.id });
    expect((await guardians.searchForSchool(orgId, schoolA, "Vvvvv")).map((g) => g.id)).toContain(created.id);

    expect((await guardians.list(actor, schoolB)).some((g) => g.id === created.id)).toBe(false);
    await expect(guardians.getOne(actor, schoolB, created.id)).rejects.toThrow(NotFoundException);
    expect((await guardians.searchForSchool(orgId, schoolB, "Vvvvv")).map((g) => g.id)).not.toContain(created.id);
  });

  dbIt("an older childless parent with no creating school is not handed to every school", async () => {
    const orphan = await prisma.guardian.create({ data: { firstName: "Orphan", lastName: tag } });
    expect((await guardians.list(actor, schoolA)).some((g) => g.id === orphan.id)).toBe(false);
    await expect(guardians.getOne(actor, schoolA, orphan.id)).rejects.toThrow(NotFoundException);
  });
});
