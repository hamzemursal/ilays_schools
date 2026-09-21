import { ConflictException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { SchoolsService } from "../schools/schools.service";
import { GuardiansService } from "./guardians.service";
import type { AuditService } from "../audit/audit.service";

// REAL-DATABASE test of the parent/guardian business rule: a student has at
// most ONE Mother and ONE Father (active links); any number of other
// relationships; one parent can be linked to many children. Runs when
// DATABASE_URL is set (CI's api job).
const describeWithDb = process.env.DATABASE_URL ? describe : describe.skip;

let dbAvailable = true;
function dbIt(name: string, fn: () => Promise<void> | void) {
  it(name, async () => {
    if (!dbAvailable) {
      console.warn(`[guardian relationship integration] no database reachable - not run: ${name}`);
      return;
    }
    await fn();
  });
}

describeWithDb("Guardian relationships — one Mother, one Father per student (real database)", () => {
  const prisma = new PrismaService();
  const audit = { record: jest.fn().mockResolvedValue(undefined) } as unknown as AuditService;
  const guardians = new GuardiansService(prisma, new SchoolsService(prisma, audit), audit);

  const tag = `gr${Date.now().toString(36)}`;
  const created = { orgIds: [] as string[], studentIds: [] as string[], guardianIds: [] as string[], schoolIds: [] as string[] };
  let orgId: string;

  async function makeStudent(first: string) {
    const student = await prisma.student.create({
      data: { organizationId: orgId, firstName: first, lastName: tag, dateOfBirth: new Date("2012-01-01"), sex: "MALE" },
    });
    created.studentIds.push(student.id);
    return student.id;
  }

  async function makeGuardian(first: string) {
    const g = await prisma.guardian.create({ data: { firstName: first, lastName: tag, phone: `06${Math.floor(Math.random() * 1e8)}` } });
    created.guardianIds.push(g.id);
    return g.id;
  }

  const activeCount = (studentId: string, relationship: "MOTHER" | "FATHER" | "GUARDIAN" | "OTHER") =>
    prisma.studentGuardian.count({ where: { studentId, relationship, status: "ACTIVE" } });

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
    created.orgIds.push(org.id);
  }, 60_000);

  afterAll(async () => {
    if (!dbAvailable) return;
    try {
      await prisma.student.deleteMany({ where: { id: { in: created.studentIds } } });
      await prisma.guardian.deleteMany({ where: { id: { in: created.guardianIds } } });
      await prisma.organization.deleteMany({ where: { id: { in: created.orgIds } } });
    } catch {
      /* leftovers are harmless: every name carries a unique tag */
    } finally {
      await prisma.$disconnect();
    }
  }, 60_000);

  dbIt("a second Mother is rejected (naming the first) and nothing is written; a second Father likewise", async () => {
    const student = await makeStudent("One");
    const [mother1, mother2, father1, father2] = await Promise.all(["Amina", "Asha", "Hassan", "Hussein"].map(makeGuardian));

    await guardians.linkToStudent(prisma, student, mother1, "MOTHER", true);
    await expect(guardians.linkToStudent(prisma, student, mother2, "MOTHER")).rejects.toThrow(ConflictException);
    await expect(guardians.linkToStudent(prisma, student, mother2, "MOTHER")).rejects.toThrow(/already has a Mother \(Amina /);
    expect(await activeCount(student, "MOTHER")).toBe(1);

    await guardians.linkToStudent(prisma, student, father1, "FATHER");
    await expect(guardians.linkToStudent(prisma, student, father2, "FATHER")).rejects.toThrow(/already has a Father \(Hassan /);
    expect(await activeCount(student, "FATHER")).toBe(1);
    // The rejected guardians were not linked in any way.
    expect(await prisma.studentGuardian.count({ where: { studentId: student, guardianId: { in: [mother2, father2] } } })).toBe(0);
  });

  dbIt("Guardian and Other relative have no limit — step-parent / uncle / aunt style relatives all fit", async () => {
    const student = await makeStudent("Two");
    const relatives = await Promise.all(["StepParent", "Uncle", "Aunt", "Cousin"].map(makeGuardian));

    await guardians.linkToStudent(prisma, student, relatives[0], "GUARDIAN");
    await guardians.linkToStudent(prisma, student, relatives[1], "OTHER");
    await guardians.linkToStudent(prisma, student, relatives[2], "OTHER");
    await guardians.linkToStudent(prisma, student, relatives[3], "GUARDIAN");

    expect(await prisma.studentGuardian.count({ where: { studentId: student, status: "ACTIVE" } })).toBe(4);
  });

  dbIt("one parent can be the Mother of several children — no duplicate parent identity", async () => {
    const [a, b, c] = await Promise.all(["A", "B", "C"].map(makeStudent));
    const mother = await makeGuardian("Fadumo");

    for (const child of [a, b, c]) await guardians.linkToStudent(prisma, child, mother, "MOTHER");

    expect(await prisma.studentGuardian.count({ where: { guardianId: mother, relationship: "MOTHER", status: "ACTIVE" } })).toBe(3);
    expect(await prisma.guardian.count({ where: { id: mother } })).toBe(1);
  });

  dbIt("re-saving the SAME guardian's own link (e.g. changing the primary-contact flag) is not a conflict", async () => {
    const student = await makeStudent("Three");
    const mother = await makeGuardian("Hodan");
    await guardians.linkToStudent(prisma, student, mother, "MOTHER", false);

    await expect(guardians.linkToStudent(prisma, student, mother, "MOTHER", true)).resolves.toMatchObject({ isPrimaryContact: true });

    expect(await activeCount(student, "MOTHER")).toBe(1);
  });

  dbIt("changing an existing Guardian link to Mother while another Mother exists is rejected too", async () => {
    const student = await makeStudent("Four");
    const [mother, other] = await Promise.all(["Sahra", "Ifrah"].map(makeGuardian));
    await guardians.linkToStudent(prisma, student, mother, "MOTHER");
    await guardians.linkToStudent(prisma, student, other, "GUARDIAN");

    await expect(guardians.linkToStudent(prisma, student, other, "MOTHER")).rejects.toThrow(ConflictException);

    expect((await prisma.studentGuardian.findUniqueOrThrow({ where: { studentId_guardianId: { studentId: student, guardianId: other } } })).relationship).toBe("GUARDIAN");
  });

  dbIt("a REMOVED (inactive) Mother frees the slot for a new Mother", async () => {
    const student = await makeStudent("Five");
    const [old, replacement] = await Promise.all(["Old", "New"].map(makeGuardian));
    await guardians.linkToStudent(prisma, student, old, "MOTHER");
    await prisma.studentGuardian.update({ where: { studentId_guardianId: { studentId: student, guardianId: old } }, data: { status: "INACTIVE" } });

    await guardians.linkToStudent(prisma, student, replacement, "MOTHER");

    expect(await activeCount(student, "MOTHER")).toBe(1);
  });

  dbIt("add-parent-to-student is atomic: a second Mother is refused AND the new parent record is not left behind", async () => {
    const student = await makeStudent("Seven");
    const first = await makeGuardian("FirstMother");
    await guardians.linkToStudent(prisma, student, first, "MOTHER");
    const before = await prisma.guardian.count({ where: { lastName: tag } });

    await expect(
      guardians.addToStudent(orgId, student, { firstName: "Orphan", lastName: tag, phone: `0688${Date.now() % 1e6}`, relationship: "MOTHER" }),
    ).rejects.toThrow(ConflictException);

    expect(await prisma.guardian.count({ where: { lastName: tag } })).toBe(before);
    expect(await prisma.guardian.count({ where: { firstName: "Orphan", lastName: tag } })).toBe(0);
    expect(await activeCount(student, "MOTHER")).toBe(1);
  });

  dbIt("add-parent-to-student reuses an existing parent by phone instead of creating a duplicate, and links a valid relationship", async () => {
    const student = await makeStudent("Eight");
    const existing = await prisma.guardian.create({ data: { firstName: "Reused", lastName: tag, phone: `0699${Date.now() % 1e6}` } });
    created.guardianIds.push(existing.id);
    const before = await prisma.guardian.count({ where: { lastName: tag } });

    const linked = await guardians.addToStudent(orgId, student, { firstName: "Reused", lastName: tag, phone: existing.phone!, relationship: "FATHER" });

    expect(linked.id).toBe(existing.id);
    expect(await prisma.guardian.count({ where: { lastName: tag } })).toBe(before);
    expect(await activeCount(student, "FATHER")).toBe(1);
  });

  dbIt("two Mothers submitted in ONE request (the new-student wizard) fail as a whole — nothing is left behind", async () => {
    const student = await makeStudent("Six");
    const [m1, m2] = await Promise.all(["Wizard1", "Wizard2"].map(makeGuardian));

    await expect(
      prisma.$transaction(async (tx) => {
        await guardians.linkToStudent(tx, student, m1, "MOTHER");
        await guardians.linkToStudent(tx, student, m2, "MOTHER");
      }),
    ).rejects.toThrow(ConflictException);

    expect(await prisma.studentGuardian.count({ where: { studentId: student } })).toBe(0);
  });
});
