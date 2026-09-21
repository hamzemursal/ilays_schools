import { ConflictException, ForbiddenException, NotFoundException } from "@nestjs/common";
import * as argon2 from "argon2";
import { PrismaService } from "../prisma/prisma.service";
import type { AuthenticatedUser } from "./types/authenticated-user";
import { SchoolsService } from "../schools/schools.service";
import { StudentsService } from "../students/students.service";
import { GuardiansService } from "../guardians/guardians.service";
import type { AuditService } from "../audit/audit.service";
import type { StorageService } from "../storage/storage.service";

// REAL-DATABASE test of the portal password reset (runs when DATABASE_URL is
// set, as in CI's api job). The mock tests prove which writes are attempted;
// this proves the actual rows: the very same User/Student/Guardian/links come
// out of a reset, only the credential changes, and the result really is a
// working, hashed, must-change password on that one account.
const describeWithDb = process.env.DATABASE_URL ? describe : describe.skip;

let dbAvailable = true;
function dbIt(name: string, fn: () => Promise<void> | void) {
  it(name, async () => {
    if (!dbAvailable) {
      console.warn(`[portal reset integration] no database reachable - not run: ${name}`);
      return;
    }
    await fn();
  });
}

describeWithDb("Portal password reset — real database", () => {
  const prisma = new PrismaService();
  const auditCalls: unknown[] = [];
  const audit = { record: jest.fn(async (params: unknown) => void auditCalls.push(params)) } as unknown as AuditService;
  const schools = new SchoolsService(prisma, audit);
  const students = new StudentsService(prisma, schools, {} as unknown as GuardiansService, {} as unknown as StorageService, audit);
  const guardians = new GuardiansService(prisma, schools, audit);

  const tag = `pw${Date.now().toString(36)}`;
  const created = { orgIds: [] as string[], userIds: [] as string[], studentIds: [] as string[], guardianIds: [] as string[] };

  let orgId: string;
  let schoolId: string;
  let otherSchoolId: string;
  let yearId: string;
  let classId: string;
  let sectionId: string;
  let admin: AuthenticatedUser;
  let otherSchoolAdmin: AuthenticatedUser;

  let studentId: string;
  let studentUserId: string;
  let studentNumber: string;
  let studentTemp: string;

  let parentGuardianId: string;
  let parentUserId: string;
  let parentChildStudentId: string;
  let pendingGuardianId: string;
  let pendingUserId: string;
  let multiRoleGuardianId: string;

  async function makeUser(label: string, status: "ACTIVE" | "PENDING_SETUP" = "ACTIVE") {
    const user = await prisma.user.create({ data: { email: `${label}.${tag}@it.test`, organizationId: orgId, status } });
    created.userIds.push(user.id);
    return user;
  }

  const actorFor = (userId: string, schoolIds: string[]): AuthenticatedUser => ({
    id: userId,
    email: `${userId}@it.test`,
    organizationId: orgId,
    roles: ["SCHOOL_ADMIN"],
    permissions: ["students.update", "guardians.manage"],
    schoolIds,
  });

  async function makeStudent(first: string) {
    const student = await prisma.student.create({
      data: { organizationId: orgId, firstName: first, lastName: tag, dateOfBirth: new Date("2011-01-01"), sex: "FEMALE" },
    });
    created.studentIds.push(student.id);
    return student;
  }

  async function makeGuardian(first: string, email: string) {
    const guardian = await prisma.guardian.create({ data: { firstName: first, lastName: tag, email } });
    created.guardianIds.push(guardian.id);
    return guardian;
  }

  // Everything a reset must leave exactly as it found it.
  async function snapshot() {
    const userIds = created.userIds;
    const [users, studentsCount, guardiansCount, links, userRoles, userSchools, enrollments, studentRow, parentRow] = await Promise.all([
      prisma.user.count({ where: { organizationId: orgId } }),
      prisma.student.count({ where: { id: { in: created.studentIds } } }),
      prisma.guardian.count({ where: { id: { in: created.guardianIds } } }),
      prisma.studentGuardian.count({ where: { studentId: { in: created.studentIds } } }),
      prisma.userRole.count({ where: { userId: { in: userIds } } }),
      prisma.userSchool.count({ where: { userId: { in: userIds } } }),
      prisma.studentEnrollment.count({ where: { schoolId: { in: [schoolId, otherSchoolId] } } }),
      prisma.student.findUniqueOrThrow({ where: { id: studentId }, include: { enrollments: { select: { id: true, studentNumber: true } } } }),
      prisma.guardian.findUniqueOrThrow({ where: { id: parentGuardianId }, select: { id: true, userId: true, guardianCode: true } }),
    ]);
    return {
      counts: { users, studentsCount, guardiansCount, links, userRoles, userSchools, enrollments },
      student: { id: studentRow.id, userId: studentRow.userId, enrollments: studentRow.enrollments },
      parent: parentRow,
    };
  }

  beforeAll(async () => {
    try {
      await prisma.$connect();
    } catch (error) {
      if (process.env.CI) throw error;
      dbAvailable = false;
      return;
    }

    // CI's api job runs migrations only (no seed): make sure the roles exist.
    for (const name of ["STUDENT", "PARENT", "TEACHER"]) {
      await prisma.role.upsert({ where: { name }, update: {}, create: { name } });
    }

    const org = await prisma.organization.create({ data: { name: `Org ${tag}` } });
    orgId = org.id;
    created.orgIds.push(org.id);
    const school = await prisma.school.create({ data: { organizationId: orgId, name: `Saamalay ${tag}`, type: "SECONDARY" } });
    const other = await prisma.school.create({ data: { organizationId: orgId, name: `Other ${tag}`, type: "SECONDARY" } });
    schoolId = school.id;
    otherSchoolId = other.id;
    const division = await prisma.division.create({ data: { schoolId, type: "SECONDARY" } });
    const year = await prisma.academicYear.create({
      data: { schoolId, name: "2027", startDate: new Date("2027-01-01"), endDate: new Date("2027-12-31"), isCurrent: true },
    });
    const klass = await prisma.class.create({ data: { divisionId: division.id, name: "Form 1", level: 1 } });
    const section = await prisma.section.create({ data: { classId: klass.id, name: "A" } });
    yearId = year.id;
    classId = klass.id;
    sectionId = section.id;

    const enrol = (id: string, n: string, roll: number) =>
      prisma.studentEnrollment.create({
        data: {
          studentId: id, organizationId: orgId, schoolId, academicYearId: year.id, classId: klass.id, sectionId: section.id,
          studentNumber: `STU-${tag}-${n}`, rollNumber: roll,
        },
      });

    const adminUser = await makeUser("admin");
    await prisma.userSchool.create({ data: { userId: adminUser.id, schoolId } });
    admin = actorFor(adminUser.id, [schoolId]);
    const otherAdminUser = await makeUser("admin-other");
    await prisma.userSchool.create({ data: { userId: otherAdminUser.id, schoolId: otherSchoolId } });
    otherSchoolAdmin = actorFor(otherAdminUser.id, [otherSchoolId]);

    // The student: a real portal account created the real way.
    const student = await makeStudent("Ayaan");
    studentId = student.id;
    const enrollment = await enrol(student.id, "s1", 1);
    studentNumber = enrollment.studentNumber;
    const account = await students.createPortalAccount(admin, student.id);
    studentTemp = account.temporaryPassword;
    studentUserId = (await prisma.student.findUniqueOrThrow({ where: { id: student.id } })).userId!;
    created.userIds.push(studentUserId); // created by the service, tracked for counts and cleanup

    // Parent A: linked to a child, invite accepted (ACTIVE with a password).
    const child = await makeStudent("Bilan");
    parentChildStudentId = child.id;
    await enrol(child.id, "s2", 2);
    const parent = await makeGuardian("Amina", `amina.${tag}@it.test`);
    parentGuardianId = parent.id;
    await prisma.studentGuardian.create({ data: { studentId: child.id, guardianId: parent.id, relationship: "MOTHER" } });
    await guardians.createPortalAccount(admin, schoolId, parent.id, {});
    parentUserId = (await prisma.guardian.findUniqueOrThrow({ where: { id: parent.id } })).userId!;
    created.userIds.push(parentUserId);
    await prisma.user.update({
      where: { id: parentUserId },
      data: { status: "ACTIVE", passwordHash: await argon2.hash("OriginalParentPass1!", { type: argon2.argon2id }) },
    });
    await prisma.invitation.updateMany({ where: { userId: parentUserId }, data: { status: "ACCEPTED" } });

    // Parent B: invited but never finished setup (PENDING_SETUP, live invite).
    const pendingChild = await makeStudent("Cali");
    await enrol(pendingChild.id, "s3", 3);
    const pending = await makeGuardian("Hibo", `hibo.${tag}@it.test`);
    pendingGuardianId = pending.id;
    await prisma.studentGuardian.create({ data: { studentId: pendingChild.id, guardianId: pending.id, relationship: "FATHER" } });
    await guardians.createPortalAccount(admin, schoolId, pending.id, {});
    pendingUserId = (await prisma.guardian.findUniqueOrThrow({ where: { id: pending.id } })).userId!;
    created.userIds.push(pendingUserId);

    // Parent C: a login that is ALSO a teacher — must never be resettable as a "parent".
    const multiChild = await makeStudent("Dahir");
    await enrol(multiChild.id, "s4", 4);
    const multi = await makeGuardian("Farah", `farah.${tag}@it.test`);
    multiRoleGuardianId = multi.id;
    await prisma.studentGuardian.create({ data: { studentId: multiChild.id, guardianId: multi.id, relationship: "GUARDIAN" } });
    const multiUser = await makeUser("multi");
    await prisma.guardian.update({ where: { id: multi.id }, data: { userId: multiUser.id } });
    for (const name of ["PARENT", "TEACHER"]) {
      const role = await prisma.role.findUniqueOrThrow({ where: { name } });
      await prisma.userRole.create({ data: { userId: multiUser.id, roleId: role.id } });
    }
  }, 90_000);

  afterAll(async () => {
    if (!dbAvailable) return;
    try {
      const schoolIds = [schoolId, otherSchoolId].filter(Boolean);
      await prisma.studentEnrollment.deleteMany({ where: { schoolId: { in: schoolIds } } });
      await prisma.student.deleteMany({ where: { id: { in: created.studentIds } } });
      await prisma.guardian.deleteMany({ where: { id: { in: created.guardianIds } } });
      await prisma.user.deleteMany({ where: { id: { in: created.userIds } } });
      await prisma.school.deleteMany({ where: { id: { in: schoolIds } } });
      await prisma.organization.deleteMany({ where: { id: { in: created.orgIds } } });
    } catch {
      /* leftovers are harmless: every name carries a unique tag */
    } finally {
      await prisma.$disconnect();
    }
  }, 60_000);

  describe("Student portal account", () => {
    dbIt("the account created the normal way starts with a temporary password that must be changed", async () => {
      const user = await prisma.user.findUniqueOrThrow({ where: { id: studentUserId } });

      expect(user.mustChangePassword).toBe(true);
      expect(await argon2.verify(user.passwordHash!, studentTemp)).toBe(true);
    });

    dbIt("reset changes ONLY the credential: same user, same student, same student number, no new rows anywhere", async () => {
      // The student has already changed it themselves, as a real user would.
      const own = await argon2.hash("StudentOwnPass1!", { type: argon2.argon2id });
      await prisma.user.update({ where: { id: studentUserId }, data: { passwordHash: own, mustChangePassword: false } });
      const before = await snapshot();

      const result = await students.resetPortalPassword(admin, studentId);

      const after = await snapshot();
      expect(after).toEqual(before);
      expect(after.student.userId).toBe(studentUserId);
      expect(result.loginId).toBe(studentNumber);

      const user = await prisma.user.findUniqueOrThrow({ where: { id: studentUserId } });
      expect(user.id).toBe(studentUserId);
      expect(user.mustChangePassword).toBe(true);
      expect(user.status).toBe("ACTIVE");
      expect(await argon2.verify(user.passwordHash!, result.temporaryPassword)).toBe(true);
      expect(await argon2.verify(user.passwordHash!, "StudentOwnPass1!")).toBe(false);
      expect(user.passwordHash).not.toContain(result.temporaryPassword);
    });

    dbIt("revokes the student's live sessions", async () => {
      await prisma.refreshToken.create({ data: { userId: studentUserId, tokenHash: `rt-${tag}-1`, expiresAt: new Date(Date.now() + 3_600_000) } });
      await prisma.refreshToken.create({ data: { userId: studentUserId, tokenHash: `rt-${tag}-2`, expiresAt: new Date(Date.now() + 3_600_000) } });

      await students.resetPortalPassword(admin, studentId);

      const live = await prisma.refreshToken.count({ where: { userId: studentUserId, revoked: false } });
      expect(live).toBe(0);
    });

    dbIt("the audit entries name the actor and student and contain no password or hash", async () => {
      auditCalls.length = 0;
      const { temporaryPassword } = await students.resetPortalPassword(admin, studentId);

      const payload = JSON.stringify(auditCalls);
      expect(payload).toContain("STUDENT_PORTAL_PASSWORD_RESET");
      expect(payload).toContain(admin.id);
      expect(payload).not.toContain(temporaryPassword);
      expect(payload).not.toMatch(/argon2|passwordHash/i);
    });

    dbIt("an admin of another school cannot reset this student's password", async () => {
      const hashBefore = (await prisma.user.findUniqueOrThrow({ where: { id: studentUserId } })).passwordHash;

      await expect(students.resetPortalPassword(otherSchoolAdmin, studentId)).rejects.toThrow(NotFoundException);

      expect((await prisma.user.findUniqueOrThrow({ where: { id: studentUserId } })).passwordHash).toBe(hashBefore);
    });

    dbIt("a student with no portal account cannot be 'reset' into one", async () => {
      const bare = await makeStudent("Nobody");
      await prisma.studentEnrollment.create({
        data: {
          studentId: bare.id, organizationId: orgId, schoolId, academicYearId: yearId, classId, sectionId,
          studentNumber: `STU-${tag}-bare`, rollNumber: 9,
        },
      });
      const usersBefore = await prisma.user.count({ where: { organizationId: orgId } });

      await expect(students.resetPortalPassword(admin, bare.id)).rejects.toThrow("no portal account yet");

      expect(await prisma.user.count({ where: { organizationId: orgId } })).toBe(usersBefore);
      expect((await prisma.student.findUniqueOrThrow({ where: { id: bare.id } })).userId).toBeNull();
    });

    dbIt("a portal login that is really a multi-role account is refused", async () => {
      const teacherRole = await prisma.role.findUniqueOrThrow({ where: { name: "TEACHER" } });
      await prisma.userRole.create({ data: { userId: studentUserId, roleId: teacherRole.id } });
      try {
        const hashBefore = (await prisma.user.findUniqueOrThrow({ where: { id: studentUserId } })).passwordHash;

        await expect(students.resetPortalPassword(admin, studentId)).rejects.toThrow(ForbiddenException);

        expect((await prisma.user.findUniqueOrThrow({ where: { id: studentUserId } })).passwordHash).toBe(hashBefore);
      } finally {
        await prisma.userRole.delete({ where: { userId_roleId: { userId: studentUserId, roleId: teacherRole.id } } });
      }
    });
  });

  describe("Parent portal account", () => {
    dbIt("reset changes ONLY the credential: same user, same guardian, same student link, no new rows anywhere", async () => {
      const before = await snapshot();

      const result = await guardians.resetPortalPassword(admin, schoolId, parentGuardianId);

      const after = await snapshot();
      expect(after).toEqual(before);
      expect(after.parent.userId).toBe(parentUserId);
      expect(result.email).toBe(`amina.${tag}@it.test`);

      const user = await prisma.user.findUniqueOrThrow({ where: { id: parentUserId } });
      expect(user.mustChangePassword).toBe(true);
      expect(await argon2.verify(user.passwordHash!, result.temporaryPassword)).toBe(true);
      expect(await argon2.verify(user.passwordHash!, "OriginalParentPass1!")).toBe(false);

      // The single existing student-parent relationship, untouched and not duplicated.
      const links = await prisma.studentGuardian.findMany({ where: { guardianId: parentGuardianId } });
      expect(links).toHaveLength(1);
      expect(links[0]).toMatchObject({ studentId: parentChildStudentId, relationship: "MOTHER", status: "ACTIVE" });
    });

    dbIt("a parent who never finished setup gets working credentials, and the stale invite link is revoked", async () => {
      const pendingBefore = await prisma.invitation.count({ where: { userId: pendingUserId, status: "PENDING" } });
      expect(pendingBefore).toBe(1);

      const result = await guardians.resetPortalPassword(admin, schoolId, pendingGuardianId);

      const user = await prisma.user.findUniqueOrThrow({ where: { id: pendingUserId } });
      expect(user.status).toBe("ACTIVE");
      expect(user.mustChangePassword).toBe(true);
      expect(await argon2.verify(user.passwordHash!, result.temporaryPassword)).toBe(true);
      expect(await prisma.invitation.count({ where: { userId: pendingUserId, status: "PENDING" } })).toBe(0);
      expect(await prisma.invitation.count({ where: { userId: pendingUserId } })).toBe(1); // history kept, nothing new
    });

    dbIt("the audit entries name the actor and parent and contain no password or hash", async () => {
      auditCalls.length = 0;
      const { temporaryPassword } = await guardians.resetPortalPassword(admin, schoolId, parentGuardianId);

      const payload = JSON.stringify(auditCalls);
      expect(payload).toContain("PARENT_PORTAL_PASSWORD_RESET");
      expect(payload).not.toContain(temporaryPassword);
      expect(payload).not.toMatch(/argon2|passwordHash/i);
    });

    dbIt("an admin of another school cannot reset this parent's password", async () => {
      const hashBefore = (await prisma.user.findUniqueOrThrow({ where: { id: parentUserId } })).passwordHash;

      await expect(guardians.resetPortalPassword(otherSchoolAdmin, schoolId, parentGuardianId)).rejects.toThrow();
      await expect(guardians.resetPortalPassword(otherSchoolAdmin, otherSchoolId, parentGuardianId)).rejects.toThrow(NotFoundException);

      expect((await prisma.user.findUniqueOrThrow({ where: { id: parentUserId } })).passwordHash).toBe(hashBefore);
    });

    dbIt("a parent login that is also a teacher is refused — the reset can't be used to take over another role", async () => {
      const multiUser = (await prisma.guardian.findUniqueOrThrow({ where: { id: multiRoleGuardianId } })).userId!;
      const hashBefore = (await prisma.user.findUniqueOrThrow({ where: { id: multiUser } })).passwordHash;

      await expect(guardians.resetPortalPassword(admin, schoolId, multiRoleGuardianId)).rejects.toThrow(ForbiddenException);

      expect((await prisma.user.findUniqueOrThrow({ where: { id: multiUser } })).passwordHash).toBe(hashBefore);
    });

    dbIt("a suspended parent account stays suspended", async () => {
      await prisma.user.update({ where: { id: parentUserId }, data: { status: "SUSPENDED" } });
      try {
        await expect(guardians.resetPortalPassword(admin, schoolId, parentGuardianId)).rejects.toThrow(ConflictException);
        expect((await prisma.user.findUniqueOrThrow({ where: { id: parentUserId } })).status).toBe("SUSPENDED");
      } finally {
        await prisma.user.update({ where: { id: parentUserId }, data: { status: "ACTIVE" } });
      }
    });
  });
});
