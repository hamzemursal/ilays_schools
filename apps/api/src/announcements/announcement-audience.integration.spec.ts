import { BadRequestException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { SchoolsService } from "../schools/schools.service";
import { GuardiansService } from "../guardians/guardians.service";
import { GuardianPortalService } from "../guardians/guardian-portal.service";
import { StudentPortalService } from "../students/student-portal.service";
import { NotificationsService } from "../notifications/notifications.service";
import type { AuditService } from "../audit/audit.service";
import type { AuthenticatedUser } from "../auth/types/authenticated-user";
import { AnnouncementsService } from "./announcements.service";
import { AnnouncementAudienceService } from "./announcement-audience.service";

// REAL-DATABASE test of announcement audiences: who receives each audience,
// scope and school isolation, one delivery per person, and that every inbox
// (student, parent, teacher/staff, the topbar bell) reads the same delivered
// rows. Runs when DATABASE_URL is set (CI's api job).
const describeWithDb = process.env.DATABASE_URL ? describe : describe.skip;

let dbAvailable = true;
function dbIt(name: string, fn: () => Promise<void> | void) {
  it(name, async () => {
    if (!dbAvailable) {
      console.warn(`[announcement audience integration] no database reachable - not run: ${name}`);
      return;
    }
    await fn();
  });
}

describeWithDb("Announcement audiences (real database)", () => {
  const prisma = new PrismaService();
  const audit = { record: jest.fn().mockResolvedValue(undefined) } as unknown as AuditService;
  const schools = new SchoolsService(prisma, audit);
  const audience = new AnnouncementAudienceService(prisma);
  const announcements = new AnnouncementsService(prisma, schools, audience);
  const guardians = new GuardiansService(prisma, schools, audit);
  const parentPortal = new GuardianPortalService(prisma, guardians);
  const studentPortal = new StudentPortalService(prisma);
  const notifications = new NotificationsService(prisma);

  const tag = `aa${Date.now().toString(36)}`;
  const created = { orgIds: [] as string[], userIds: [] as string[], studentIds: [] as string[], guardianIds: [] as string[] };
  let n = 0;

  // Fixture ids, filled in beforeAll.
  const f = {} as Record<string, string>;
  let superAdmin: AuthenticatedUser;

  async function makeUser(orgId: string, label: string) {
    const user = await prisma.user.create({ data: { email: `${label}.${tag}@it.test`, organizationId: orgId, status: "ACTIVE" } });
    created.userIds.push(user.id);
    return user.id;
  }

  async function makeStudent(orgId: string, label: string, status: "ACTIVE" | "GRADUATED" = "ACTIVE") {
    const userId = await makeUser(orgId, label);
    const student = await prisma.student.create({
      data: { organizationId: orgId, userId, firstName: label, lastName: tag, dateOfBirth: new Date("2012-01-01"), sex: "FEMALE", currentStatus: status },
    });
    created.studentIds.push(student.id);
    return { userId, studentId: student.id };
  }

  async function enroll(
    orgId: string,
    studentId: string,
    s: { schoolId: string; yearId: string; classId: string; sectionId: string },
    status: "ACTIVE" | "GRADUATED" = "ACTIVE",
  ) {
    n++;
    await prisma.studentEnrollment.create({
      data: {
        studentId, organizationId: orgId, schoolId: s.schoolId, academicYearId: s.yearId, classId: s.classId, sectionId: s.sectionId,
        studentNumber: `STU-${tag}-${n}`, rollNumber: n, status,
        ...(status === "GRADUATED" ? { endDate: new Date("2020-06-30") } : {}),
      },
    });
  }

  async function makeParent(orgId: string, label: string, childIds: string[]) {
    const userId = await makeUser(orgId, label);
    const g = await prisma.guardian.create({ data: { userId, firstName: label, lastName: tag, phone: `06${Math.floor(Math.random() * 1e8)}` } });
    created.guardianIds.push(g.id);
    for (const studentId of childIds) await prisma.studentGuardian.create({ data: { studentId, guardianId: g.id, relationship: "OTHER" } });
    return { userId, guardianId: g.id };
  }

  async function makeSchool(orgId: string, name: string) {
    const school = await prisma.school.create({ data: { organizationId: orgId, name: `${name} ${tag}`, type: "SECONDARY" } });
    const division = await prisma.division.create({ data: { schoolId: school.id, type: "SECONDARY" } });
    const year = await prisma.academicYear.create({
      data: { schoolId: school.id, name: `2029-${tag}`, startDate: new Date("2029-09-01"), endDate: new Date("2030-06-30"), isCurrent: true },
    });
    const form3 = await prisma.class.create({ data: { divisionId: division.id, academicYearId: year.id, name: "Form 3", level: 3 } });
    const form4 = await prisma.class.create({ data: { divisionId: division.id, academicYearId: year.id, name: "Form 4", level: 4 } });
    const secA = await prisma.section.create({ data: { classId: form3.id, name: "A" } });
    const secB = await prisma.section.create({ data: { classId: form3.id, name: "B" } });
    const sec4 = await prisma.section.create({ data: { classId: form4.id, name: "A" } });
    const subject = await prisma.subject.create({ data: { schoolId: school.id, name: `Xisaab ${tag}` } });
    return { schoolId: school.id, yearId: year.id, form3: form3.id, form4: form4.id, secA: secA.id, secB: secB.id, sec4: sec4.id, subjectId: subject.id };
  }

  const recipientsOf = async (announcementId: string) =>
    prisma.notification.findMany({ where: { announcementId }, select: { userId: true, guardianId: true } });
  const userIdsOf = async (announcementId: string) => new Set((await recipientsOf(announcementId)).map((r) => r.userId));
  const post = (dto: Omit<Parameters<AnnouncementsService["create"]>[2], "title" | "body">, schoolId = f.s1) =>
    announcements.create(superAdmin, schoolId, { title: `T ${tag}`, body: "B", ...dto });

  beforeAll(async () => {
    try {
      await prisma.$connect();
    } catch (error) {
      if (process.env.CI) throw error;
      dbAvailable = false;
      return;
    }
    const org = await prisma.organization.create({ data: { name: `Org ${tag}` } });
    created.orgIds.push(org.id);
    const s1 = await makeSchool(org.id, "SYL");
    const s2 = await makeSchool(org.id, "Other");
    Object.assign(f, { s1: s1.schoolId, s1Year: s1.yearId, s1Form3: s1.form3, s1SecA: s1.secA, s1SecB: s1.secB, s2: s2.schoolId, s2Form3: s2.form3 });

    const at = (s: typeof s1, classId: string, sectionId: string) => ({ schoolId: s.schoolId, yearId: s.yearId, classId, sectionId });

    const stuA = await makeStudent(org.id, "stuA");
    await enroll(org.id, stuA.studentId, at(s1, s1.form3, s1.secA));
    const stuB = await makeStudent(org.id, "stuB");
    await enroll(org.id, stuB.studentId, at(s1, s1.form3, s1.secB));
    const grad = await makeStudent(org.id, "grad", "GRADUATED");
    await enroll(org.id, grad.studentId, at(s1, s1.form4, s1.sec4), "GRADUATED");
    const other = await makeStudent(org.id, "otherStu");
    await enroll(org.id, other.studentId, at(s2, s2.form3, s2.secA));

    const pActive = await makeParent(org.id, "pActive", [stuA.studentId]);
    const pFormer = await makeParent(org.id, "pFormer", [grad.studentId]);
    const pMixed = await makeParent(org.id, "pMixed", [stuB.studentId, grad.studentId]);
    const pOther = await makeParent(org.id, "pOther", [other.studentId]);

    const tA = await makeUser(org.id, "teacherA");
    const teacherA = await prisma.teacher.create({
      data: { userId: tA, schoolId: s1.schoolId, firstName: "Teacher", lastName: "A", employeeNumber: `E1-${tag}`, teacherCode: `T1-${tag}` },
    });
    await prisma.teacherAssignment.create({
      data: { teacherId: teacherA.id, schoolId: s1.schoolId, academicYearId: s1.yearId, sectionId: s1.secA, subjectId: s1.subjectId },
    });
    const tHome = await makeUser(org.id, "teacherHome");
    await prisma.teacher.create({
      data: { userId: tHome, schoolId: s1.schoolId, firstName: "Teacher", lastName: "Home", employeeNumber: `E2-${tag}`, teacherCode: `T2-${tag}` },
    });
    const tOther = await makeUser(org.id, "teacherOther");
    await prisma.teacher.create({
      data: { userId: tOther, schoolId: s2.schoolId, firstName: "Teacher", lastName: "Other", employeeNumber: `E3-${tag}`, teacherCode: `T3-${tag}` },
    });
    const staff = await makeUser(org.id, "staff");
    await prisma.staff.create({ data: { userId: staff, schoolId: s1.schoolId, staffNumber: `S1-${tag}`, firstName: "Staff", lastName: "One" } });
    const staffOther = await makeUser(org.id, "staffOther");
    await prisma.staff.create({ data: { userId: staffOther, schoolId: s2.schoolId, staffNumber: `S2-${tag}`, firstName: "Staff", lastName: "Two" } });
    const admin = await makeUser(org.id, "admin");
    const adminRole = await prisma.role.upsert({ where: { name: "SCHOOL_ADMIN" }, update: {}, create: { name: "SCHOOL_ADMIN" } });
    await prisma.userRole.create({ data: { userId: admin, roleId: adminRole.id } });
    await prisma.userSchool.create({ data: { userId: admin, schoolId: s1.schoolId } });

    Object.assign(f, {
      stuA: stuA.userId, stuB: stuB.userId, grad: grad.userId, otherStu: other.userId,
      pActive: pActive.userId, pActiveG: pActive.guardianId, pFormer: pFormer.userId, pFormerG: pFormer.guardianId,
      pMixed: pMixed.userId, pOther: pOther.userId, tA, tHome, tOther, staff, staffOther, admin,
    });
    superAdmin = { id: admin, email: "sa@it.test", organizationId: org.id, roles: ["SUPER_ADMIN"], permissions: [], schoolIds: [] };
  }, 120_000);

  afterAll(async () => {
    if (!dbAvailable) return;
    try {
      const schoolIds = (await prisma.school.findMany({ where: { organizationId: { in: created.orgIds } }, select: { id: true } })).map((s) => s.id);
      await prisma.announcement.deleteMany({ where: { schoolId: { in: schoolIds } } });
      await prisma.studentEnrollment.deleteMany({ where: { schoolId: { in: schoolIds } } });
      await prisma.student.deleteMany({ where: { id: { in: created.studentIds } } });
      await prisma.guardian.deleteMany({ where: { id: { in: created.guardianIds } } });
      await prisma.teacher.deleteMany({ where: { schoolId: { in: schoolIds } } });
      await prisma.staff.deleteMany({ where: { schoolId: { in: schoolIds } } });
      await prisma.user.deleteMany({ where: { id: { in: created.userIds } } });
      await prisma.school.deleteMany({ where: { id: { in: schoolIds } } });
      await prisma.organization.deleteMany({ where: { id: { in: created.orgIds } } });
    } catch {
      /* leftovers are harmless: every name carries a unique tag */
    } finally {
      await prisma.$disconnect();
    }
  }, 60_000);

  const actor = (id: string, roles: string[]): AuthenticatedUser => ({ id, email: "x@it.test", organizationId: null, roles, permissions: [], schoolIds: [] });

  dbIt("1-2. Current Students reaches actively enrolled students only — never a graduate or another school's student", async () => {
    const a = await post({ audience: "CURRENT_STUDENTS" });
    expect(await userIdsOf(a.id)).toEqual(new Set([f.stuA, f.stuB]));
  });

  dbIt("3. Alumni reaches the graduate only", async () => {
    const a = await post({ audience: "ALUMNI" });
    expect(await userIdsOf(a.id)).toEqual(new Set([f.grad]));
  });

  dbIt("4-6. Parents reaches parents with an active child (incl. mixed), never a former-only parent or another school's parent", async () => {
    const a = await post({ audience: "PARENTS" });
    const rows = await recipientsOf(a.id);
    expect(new Set(rows.map((r) => r.userId))).toEqual(new Set([f.pActive, f.pMixed]));
    // Stored as a parent delivery (guardianId) AND with the login, for the bell.
    expect(rows.find((r) => r.userId === f.pActive)?.guardianId).toBe(f.pActiveG);
  });

  dbIt("Former Parents reaches only parents whose children here are all former", async () => {
    const a = await post({ audience: "FORMER_PARENTS" });
    expect(await userIdsOf(a.id)).toEqual(new Set([f.pFormer]));
  });

  dbIt("7-8. Teachers reaches this school's teachers only; a Parents announcement never reaches a teacher", async () => {
    const t = await post({ audience: "TEACHERS" });
    expect(await userIdsOf(t.id)).toEqual(new Set([f.tA, f.tHome]));
    const p = await post({ audience: "PARENTS" });
    expect((await userIdsOf(p.id)).has(f.tA)).toBe(false);
  });

  dbIt("9-10. Staff reaches this school's staff and school admins; a Parents announcement never reaches staff", async () => {
    const s = await post({ audience: "STAFF" });
    expect(await userIdsOf(s.id)).toEqual(new Set([f.staff, f.admin]));
    const p = await post({ audience: "PARENTS" });
    expect((await userIdsOf(p.id)).has(f.staff)).toBe(false);
  });

  dbIt("ALL = every current user of the school — never alumni, former parents or another school", async () => {
    const a = await post({ audience: "ALL" });
    expect(await userIdsOf(a.id)).toEqual(new Set([f.stuA, f.stuB, f.pActive, f.pMixed, f.tA, f.tHome, f.staff, f.admin]));
  });

  dbIt("11. Class scope reaches that class's students; 14. the year is required and must be this school's", async () => {
    const a = await post({ audience: "CURRENT_STUDENTS", academicYearId: f.s1Year, classId: f.s1Form3 });
    expect(await userIdsOf(a.id)).toEqual(new Set([f.stuA, f.stuB]));
    await expect(post({ audience: "CURRENT_STUDENTS", classId: f.s1Form3 })).rejects.toThrow(BadRequestException);
  });

  dbIt("12. Section scope never mixes Section A and B — students, parents and teachers", async () => {
    const students = await post({ audience: "CURRENT_STUDENTS", academicYearId: f.s1Year, classId: f.s1Form3, sectionId: f.s1SecA });
    expect(await userIdsOf(students.id)).toEqual(new Set([f.stuA]));
    const parents = await post({ audience: "PARENTS", academicYearId: f.s1Year, classId: f.s1Form3, sectionId: f.s1SecB });
    expect(await userIdsOf(parents.id)).toEqual(new Set([f.pMixed]));
    const teachers = await post({ audience: "TEACHERS", academicYearId: f.s1Year, classId: f.s1Form3, sectionId: f.s1SecA });
    expect(await userIdsOf(teachers.id)).toEqual(new Set([f.tA]));
    // Staff are school-level: a section-scoped "Everyone" skips them.
    const all = await post({ audience: "ALL", academicYearId: f.s1Year, classId: f.s1Form3, sectionId: f.s1SecB });
    expect(await userIdsOf(all.id)).toEqual(new Set([f.stuB, f.pMixed]));
  });

  dbIt("13. School isolation: another school's class, a foreign section, and a scoped school-wide audience are rejected", async () => {
    await expect(post({ audience: "CURRENT_STUDENTS", academicYearId: f.s1Year, classId: f.s2Form3 })).rejects.toThrow(/Class not found/);
    await expect(
      post({ audience: "PARENTS", academicYearId: f.s1Year, classId: f.s1Form3, sectionId: "00000000-0000-4000-8000-000000000000" }),
    ).rejects.toThrow(/Section not found/);
    await expect(post({ audience: "ALUMNI", academicYearId: f.s1Year, classId: f.s1Form3 })).rejects.toThrow(/school-wide/);
    // Nothing was written by the rejected attempts.
    expect(await prisma.announcement.count({ where: { schoolId: f.s1, classId: f.s2Form3 } })).toBe(0);
  });

  dbIt("15. Specific People reaches exactly the chosen people; someone from another school is refused", async () => {
    const a = await post({ audience: "INDIVIDUAL", recipientUserIds: [f.grad, f.pFormer, f.tHome] });
    expect(await userIdsOf(a.id)).toEqual(new Set([f.grad, f.pFormer, f.tHome]));
    await expect(post({ audience: "INDIVIDUAL", recipientUserIds: [f.stuA, f.otherStu] })).rejects.toThrow(/not part of this school/);
  });

  dbIt("16. Every inbox and the bell read the same delivered rows", async () => {
    const a = await post({ audience: "ALL" });
    const has = (list: { id: string }[]) => list.some((x) => x.id === a.id);

    expect(has(await studentPortal.myAnnouncements(actor(f.stuA, ["STUDENT"])))).toBe(true);
    expect(has(await parentPortal.myAnnouncements(actor(f.pActive, ["PARENT"])))).toBe(true);
    expect(has(await announcements.mine(actor(f.tA, ["TEACHER"])))).toBe(true);
    expect(has(await announcements.mine(actor(f.staff, ["HR_STAFF"])))).toBe(true);
    for (const id of [f.stuA, f.pActive, f.tA, f.staff]) {
      const bell = await notifications.myNotifications(actor(id, []));
      expect(bell.some((row) => row.announcementId === a.id)).toBe(true);
    }
    // ...and the people it was not for see it nowhere.
    expect(has(await studentPortal.myAnnouncements(actor(f.grad, ["STUDENT"])))).toBe(false);
    expect(has(await parentPortal.myAnnouncements(actor(f.pFormer, ["PARENT"])))).toBe(false);
    expect((await notifications.myNotifications(actor(f.grad, []))).some((r) => r.announcementId === a.id)).toBe(false);
  });

  dbIt("an old announcement (no stored delivery) still shows by the legacy rule and is never re-sent", async () => {
    const legacy = await prisma.announcement.create({
      data: { schoolId: f.s1, title: `Legacy ${tag}`, body: "B", audience: "ALL", createdByUserId: f.admin },
    });
    const ids = (list: { id: string }[]) => list.map((x) => x.id);
    expect(ids(await studentPortal.myAnnouncements(actor(f.stuA, ["STUDENT"])))).toContain(legacy.id);
    expect(ids(await parentPortal.myAnnouncements(actor(f.pActive, ["PARENT"])))).toContain(legacy.id);
    // The graduate graduated long before it was published.
    expect(ids(await studentPortal.myAnnouncements(actor(f.grad, ["STUDENT"])))).not.toContain(legacy.id);
    expect(await prisma.notification.count({ where: { announcementId: legacy.id } })).toBe(0);
  });

  dbIt("17. One delivery per person — a parent of two children, or a retried write, is never duplicated", async () => {
    const a = await post({ audience: "PARENTS" });
    const rows = await recipientsOf(a.id);
    expect(rows.filter((r) => r.userId === f.pMixed)).toHaveLength(1);
    await prisma.notification.createMany({
      data: rows.map((r) => ({ userId: r.userId ?? undefined, guardianId: r.guardianId ?? undefined, announcementId: a.id, title: "T", body: "B" })),
      skipDuplicates: true,
    });
    expect(await prisma.notification.count({ where: { announcementId: a.id } })).toBe(rows.length);
  });

  dbIt("18. A Super Admin can publish for an organization school, and it still reaches only that school", async () => {
    const a = await post({ audience: "CURRENT_STUDENTS" }, f.s2);
    expect(await userIdsOf(a.id)).toEqual(new Set([f.otherStu]));
  });

  dbIt("preview counts the same people create would reach", async () => {
    const { recipients } = await announcements.preview(superAdmin, f.s1, { audience: "PARENTS" });
    expect(recipients).toBe(2);
  });
});
