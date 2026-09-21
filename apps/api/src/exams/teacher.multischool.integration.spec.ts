import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { resolveAuthenticatedUser } from "../auth/resolve-authenticated-user";
import type { AuthenticatedUser } from "../auth/types/authenticated-user";
import { SchoolsService } from "../schools/schools.service";
import { ExamsService } from "./exams.service";
import { AttendanceService } from "../attendance/attendance.service";
import type { AuditService } from "../audit/audit.service";
import type { DocumentsService } from "../documents/documents.service";
import type { NotificationsService } from "../notifications/notifications.service";
import type { StudentsService } from "../students/students.service";

// REAL-DATABASE regression test (runs only when DATABASE_URL is set, as it is
// in CI's api job). The mock-based tests can't catch this class of bug: the
// "School not found" failure for a teacher assigned at a second school lived
// in how the REAL school gate reads UserSchool / TeacherAssignment rows, which
// a mocked gate hides. This builds two fresh schools and a teacher whose only
// UserSchool membership is their home school — exactly how production data
// looks — assigns them at the second school the way the app does (a
// TeacherAssignment row), and drives the real services against real rows.
const describeWithDb = process.env.DATABASE_URL ? describe : describe.skip;

// A developer machine may have DATABASE_URL configured but no database running.
// There these tests warn and return; in CI (which always has the Postgres
// service) an unreachable database is a hard failure, never a silent pass.
let dbAvailable = true;
function dbIt(name: string, fn: () => Promise<void> | void) {
  it(name, async () => {
    if (!dbAvailable) {
      console.warn(`[multi-school integration] no database reachable - not run: ${name}`);
      return;
    }
    await fn();
  });
}

describeWithDb("Multi-school teacher — real database", () => {
  const prisma = new PrismaService();
  const audit = { record: jest.fn().mockResolvedValue(undefined) } as unknown as AuditService;
  const documents = { tryGetPhotoUrl: jest.fn().mockResolvedValue(null) } as unknown as DocumentsService;
  const notifications = { notifyUser: jest.fn(), notifySchoolStaffWithPermission: jest.fn() } as unknown as NotificationsService;
  const schools = new SchoolsService(prisma, audit);
  const exams = new ExamsService(prisma, schools, audit, documents, notifications);
  const attendance = new AttendanceService(prisma, schools, {} as unknown as StudentsService, audit, documents);

  const tag = `it${Date.now().toString(36)}`;
  const created: { orgIds: string[]; userIds: string[]; studentIds: string[] } = { orgIds: [], userIds: [], studentIds: [] };

  // Populated in beforeAll
  let home: SchoolFixture;
  let second: SchoolFixture;
  let third: SchoolFixture;
  let teacher: AuthenticatedUser;
  let homeAdmin: AuthenticatedUser;
  let secondAdmin: AuthenticatedUser;
  let otherOrgTeacher: AuthenticatedUser;
  let assignmentId: string;
  let teacherRowId: string;

  interface SchoolFixture {
    schoolId: string;
    yearId: string;
    classId: string;
    sectionAId: string;
    sectionBId: string;
    subjectId: string;
    examSubjectId: string;
    examId: string;
    otherSubjectId: string; // a second subject on the same exam that the teacher is NOT assigned to
    enrollmentIds: string[]; // in section A
  }

  async function makeSchool(orgId: string, name: string): Promise<SchoolFixture> {
    const school = await prisma.school.create({ data: { organizationId: orgId, name: `${name} ${tag}`, type: "SECONDARY" } });
    const division = await prisma.division.create({ data: { schoolId: school.id, type: "SECONDARY" } });
    const year = await prisma.academicYear.create({
      data: { schoolId: school.id, name: "2027", startDate: new Date("2027-01-01"), endDate: new Date("2027-12-31"), isCurrent: true },
    });
    const klass = await prisma.class.create({ data: { divisionId: division.id, name: "Form 1", level: 1 } });
    const secA = await prisma.section.create({ data: { classId: klass.id, name: "A" } });
    const secB = await prisma.section.create({ data: { classId: klass.id, name: "B" } });
    const subject = await prisma.subject.create({ data: { schoolId: school.id, name: `Xisaab ${tag}` } });
    await prisma.classSubject.create({ data: { classId: klass.id, subjectId: subject.id } });
    const exam = await prisma.exam.create({ data: { schoolId: school.id, academicYearId: year.id, name: `Exam ${tag}`, type: "FINAL" } });
    const examSubject = await prisma.examSubject.create({ data: { examId: exam.id, classId: klass.id, subjectId: subject.id, maxMarks: 50 } });
    const otherSubject = await prisma.subject.create({ data: { schoolId: school.id, name: `Physics ${tag}` } });
    await prisma.classSubject.create({ data: { classId: klass.id, subjectId: otherSubject.id } });
    await prisma.examSubject.create({ data: { examId: exam.id, classId: klass.id, subjectId: otherSubject.id, maxMarks: 50 } });

    const enrollmentIds: string[] = [];
    for (const [i, sec] of [secA, secA, secB].entries()) {
      const student = await prisma.student.create({
        data: { organizationId: orgId, firstName: `S${i}`, lastName: tag, dateOfBirth: new Date("2015-01-01"), sex: "MALE" },
      });
      created.studentIds.push(student.id);
      const enrollment = await prisma.studentEnrollment.create({
        data: {
          studentId: student.id, organizationId: orgId, schoolId: school.id, academicYearId: year.id, classId: klass.id,
          sectionId: sec.id, studentNumber: `STU-${tag}-${school.id.slice(0, 4)}-${i}`, rollNumber: i + 1,
        },
      });
      if (sec.id === secA.id) enrollmentIds.push(enrollment.id);
    }
    return { schoolId: school.id, yearId: year.id, classId: klass.id, sectionAId: secA.id, sectionBId: secB.id, subjectId: subject.id, examSubjectId: examSubject.id, examId: exam.id, otherSubjectId: otherSubject.id, enrollmentIds };
  }

  async function makeUser(orgId: string, email: string, schoolIds: string[]) {
    const user = await prisma.user.create({ data: { email: `${email}.${tag}@it.test`, organizationId: orgId, status: "ACTIVE" } });
    created.userIds.push(user.id);
    for (const schoolId of schoolIds) await prisma.userSchool.create({ data: { userId: user.id, schoolId } });
    return user;
  }

  // The real way the app derives an actor (memberships -> schoolIds), plus the
  // permissions the guard would have attached for the role.
  async function actorFor(userId: string, role: "TEACHER" | "SCHOOL_ADMIN"): Promise<AuthenticatedUser> {
    const base = (await resolveAuthenticatedUser(prisma, userId))!;
    const permissions = role === "TEACHER" ? ["results.enter", "results.view", "attendance.mark", "attendance.view"] : ["results.enter", "results.view", "results.approve", "attendance.view"];
    return { ...base, roles: [role], permissions };
  }

  beforeAll(async () => {
    try {
      await prisma.$connect();
    } catch (error) {
      if (process.env.CI) throw error;
      dbAvailable = false;
      return;
    }
    const org = await prisma.organization.create({ data: { name: `Org ${tag}` } });
    const otherOrg = await prisma.organization.create({ data: { name: `Other Org ${tag}` } });
    created.orgIds.push(org.id, otherOrg.id);

    home = await makeSchool(org.id, "Sayidka");
    second = await makeSchool(org.id, "Saacid");
    third = await makeSchool(org.id, "Third");

    // The teacher's ONLY membership is their home school.
    const teacherUser = await makeUser(org.id, "teacher", [home.schoolId]);
    const teacherRow = await prisma.teacher.create({
      data: { userId: teacherUser.id, schoolId: home.schoolId, firstName: "Abaadir", lastName: "Mohamed", employeeNumber: `EMP-${tag}`, teacherCode: `TCH-${tag}` },
    });
    teacherRowId = teacherRow.id;
    // Assigned at the SECOND school only (no assignment at home or third) — the way TeachersService.addAssignment records it.
    const assignment = await prisma.teacherAssignment.create({
      data: { teacherId: teacherRow.id, schoolId: second.schoolId, academicYearId: second.yearId, sectionId: second.sectionAId, subjectId: second.subjectId },
    });
    assignmentId = assignment.id;

    teacher = await actorFor(teacherUser.id, "TEACHER");
    homeAdmin = await actorFor((await makeUser(org.id, "admin-home", [home.schoolId])).id, "SCHOOL_ADMIN");
    secondAdmin = await actorFor((await makeUser(org.id, "admin-second", [second.schoolId])).id, "SCHOOL_ADMIN");

    // A teacher from a DIFFERENT organization, with an assignment row pointing at our second school
    // (something the app itself can't create) — the gate must still refuse them.
    const otherSchool = await prisma.school.create({ data: { organizationId: otherOrg.id, name: `Elsewhere ${tag}`, type: "PRIMARY" } });
    const otherUser = await makeUser(otherOrg.id, "other-teacher", [otherSchool.id]);
    const otherTeacher = await prisma.teacher.create({
      data: { userId: otherUser.id, schoolId: otherSchool.id, firstName: "Out", lastName: "Sider", employeeNumber: `EMP-O-${tag}`, teacherCode: `TCH-O-${tag}` },
    });
    await prisma.teacherAssignment.create({
      data: { teacherId: otherTeacher.id, schoolId: second.schoolId, academicYearId: second.yearId, sectionId: second.sectionAId, subjectId: second.subjectId },
    });
    otherOrgTeacher = await actorFor(otherUser.id, "TEACHER");
  }, 60_000);

  afterAll(async () => {
    if (!dbAvailable) return;
    // Best-effort cleanup in dependency order; unique names mean a leftover can never collide with a later run.
    try {
      const orgIds = created.orgIds;
      const schoolIds = (await prisma.school.findMany({ where: { organizationId: { in: orgIds } }, select: { id: true } })).map((s) => s.id);
      await prisma.attendance.deleteMany({ where: { enrollment: { schoolId: { in: schoolIds } } } });
      await prisma.result.deleteMany({ where: { enrollment: { schoolId: { in: schoolIds } } } });
      await prisma.studentEnrollment.deleteMany({ where: { schoolId: { in: schoolIds } } });
      await prisma.student.deleteMany({ where: { id: { in: created.studentIds } } });
      await prisma.teacher.deleteMany({ where: { schoolId: { in: schoolIds } } });
      await prisma.user.deleteMany({ where: { id: { in: created.userIds } } });
      await prisma.school.deleteMany({ where: { id: { in: schoolIds } } });
      await prisma.organization.deleteMany({ where: { id: { in: orgIds } } });
    } catch {
      /* leftovers are harmless */
    } finally {
      await prisma.$disconnect();
    }
  }, 60_000);

  const resultsPath = (s: SchoolFixture) => [s.schoolId, s.examSubjectId] as const;

  describe("the real school gate", () => {
    dbIt("the teacher's real actor has only their home school as a membership — no membership is ever granted by an assignment", () => {
      expect(teacher.schoolIds).toEqual([home.schoolId]);
    });

    dbIt("the strict membership check still refuses the second school (unchanged behaviour)", async () => {
      await expect(schools.findOneAccessibleOrThrow(teacher, second.schoolId)).rejects.toThrow(NotFoundException);
    });

    dbIt("the teacher-aware gate admits the second school through the assignment", async () => {
      await expect(schools.findOneAccessibleOrTeachingAtOrThrow(teacher, second.schoolId)).resolves.toMatchObject({ id: second.schoolId });
    });

    dbIt("...but not a school where the teacher holds no assignment", async () => {
      await expect(schools.findOneAccessibleOrTeachingAtOrThrow(teacher, third.schoolId)).rejects.toThrow("School not found");
    });

    dbIt("a School Admin gets no extra reach: their own school yes, a sibling school no", async () => {
      await expect(schools.findOneAccessibleOrTeachingAtOrThrow(homeAdmin, home.schoolId)).resolves.toBeDefined();
      await expect(schools.findOneAccessibleOrTeachingAtOrThrow(homeAdmin, second.schoolId)).rejects.toThrow("School not found");
      await expect(schools.findOneAccessibleOrTeachingAtOrThrow(secondAdmin, home.schoolId)).rejects.toThrow("School not found");
    });

    dbIt("a teacher from ANOTHER organization is refused even with an assignment row pointing at the school", async () => {
      await expect(schools.findOneAccessibleOrTeachingAtOrThrow(otherOrgTeacher, second.schoolId)).rejects.toThrow("School not found");
    });
  });

  describe("results, marks and submission at the second school", () => {
    dbIt("opens the results roster for the section they teach", async () => {
      const result = await exams.getResultsForSection(teacher, ...resultsPath(second), second.sectionAId);

      expect(result.students).toHaveLength(2);
      expect(result.maxMarks).toBe(50);
    });

    dbIt("enters marks, corrects one, and records an absence as NULL (not 0) — through the real database constraint", async () => {
      const [e1, e2] = second.enrollmentIds;
      await exams.enterMarks(teacher, ...resultsPath(second), second.sectionAId, { entries: [{ enrollmentId: e1, marksObtained: 30 }, { enrollmentId: e2, marksObtained: 41 }] });
      await exams.enterMarks(teacher, ...resultsPath(second), second.sectionAId, { entries: [{ enrollmentId: e1, marksObtained: 35 }] }); // increase
      await exams.enterMarks(teacher, ...resultsPath(second), second.sectionAId, { entries: [{ enrollmentId: e2, isAbsent: true }] });

      const rows = await prisma.result.findMany({ where: { enrollmentId: { in: [e1, e2] } }, orderBy: { enrollmentId: "asc" } });
      const byEnrollment = new Map(rows.map((r) => [r.enrollmentId, r]));
      expect(Number(byEnrollment.get(e1)!.marksObtained)).toBe(35);
      expect(byEnrollment.get(e2)!.marksObtained).toBeNull();
      expect(byEnrollment.get(e2)!.isAbsent).toBe(true);
    });

    dbIt("submits the results for review", async () => {
      const result = await exams.submitForReview(teacher, ...resultsPath(second), second.sectionAId);

      expect(result.submission.status).toBe("SUBMITTED");
    });

    dbIt("but cannot approve — that stays admin-only and the second school's own admin can", async () => {
      // (Permission gating is the controller's job; the service-level boundary here is school scope.)
      await expect(exams.approveSubmission(teacher, second.schoolId, second.examSubjectId, second.sectionAId)).rejects.toThrow("School not found");
      await expect(exams.approveSubmission(secondAdmin, second.schoolId, second.examSubjectId, second.sectionAId)).resolves.toBeDefined();
    });
  });

  describe("attendance at the second school", () => {
    dbIt("opens the roster they are assigned to", async () => {
      const roster = await attendance.getForSectionAndDate(teacher, second.schoolId, second.sectionAId, "2027-03-01");

      expect(roster).toHaveLength(2);
    });

    dbIt("reads that section's history", async () => {
      await expect(attendance.historyForSection(teacher, second.schoolId, second.sectionAId)).resolves.toBeDefined();
    });
  });

  describe("strict isolation", () => {
    dbIt("a section at the second school they are NOT assigned to is Forbidden (results and attendance)", async () => {
      await expect(exams.getResultsForSection(teacher, ...resultsPath(second), second.sectionBId)).rejects.toThrow(ForbiddenException);
      await expect(attendance.getForSectionAndDate(teacher, second.schoolId, second.sectionBId, "2027-03-01")).rejects.toThrow(ForbiddenException);
    });

    dbIt("the third school (no assignment at all) is invisible for results, marks and attendance", async () => {
      await expect(exams.getResultsForSection(teacher, ...resultsPath(third), third.sectionAId)).rejects.toThrow("School not found");
      await expect(exams.enterMarks(teacher, ...resultsPath(third), third.sectionAId, { entries: [] })).rejects.toThrow("School not found");
      await expect(attendance.getForSectionAndDate(teacher, third.schoolId, third.sectionAId, "2027-03-01")).rejects.toThrow("School not found");
    });

    dbIt("another school's exam-subject id through the second school's URL is not found", async () => {
      await expect(exams.getResultsForSection(teacher, second.schoolId, home.examSubjectId, second.sectionAId)).rejects.toThrow(NotFoundException);
    });

    dbIt("a student from another school cannot be given marks through this school", async () => {
      await expect(
        exams.enterMarks(teacher, ...resultsPath(second), second.sectionAId, { entries: [{ enrollmentId: home.enrollmentIds[0], marksObtained: 10 }] }),
      ).rejects.toThrow("aren't active in this section");
    });

    dbIt("the home school's own admin cannot read the second school's results", async () => {
      await expect(exams.getResultsForSection(homeAdmin, ...resultsPath(second), second.sectionAId)).rejects.toThrow("School not found");
    });

    dbIt("a teacher from another organization cannot open the results even with an assignment row", async () => {
      await expect(exams.getResultsForSection(otherOrgTeacher, ...resultsPath(second), second.sectionAId)).rejects.toThrow("School not found");
    });
  });

  describe("exam listings a teacher may call (GET /schools/:id/exams and friends)", () => {
    const subjectIdsOf = (examSubjects: Array<{ subjectId: string }>) => examSubjects.map((es) => es.subjectId).sort();

    dbIt("GET /schools/:id/exams at the second school lists the exam, narrowed to ONLY the subject the teacher is assigned to", async () => {
      const list = await exams.listExams(teacher, second.schoolId);

      expect(list).toHaveLength(1);
      expect(subjectIdsOf(list[0].examSubjects)).toEqual([second.subjectId]);
      expect(subjectIdsOf(list[0].examSubjects)).not.toContain(second.otherSubjectId);
    });

    dbIt("the single-exam view is narrowed the same way", async () => {
      const list = await exams.listExamSubjects(teacher, second.schoolId, second.examId);

      expect(subjectIdsOf(list)).toEqual([second.subjectId]);
    });

    dbIt("the school-scoped exam-papers listing is reachable too", async () => {
      await expect(exams.listExamPapers(teacher, { schoolId: second.schoolId })).resolves.toEqual([]);
    });

    dbIt("at their HOME school (a member, but no assignment there) the narrowing still applies: nothing is theirs to see", async () => {
      await expect(exams.listExams(teacher, home.schoolId)).resolves.toEqual([]);
    });

    dbIt("a school with no assignment for them stays invisible for all three listings", async () => {
      await expect(exams.listExams(teacher, third.schoolId)).rejects.toThrow("School not found");
      await expect(exams.listExamSubjects(teacher, third.schoolId, third.examId)).rejects.toThrow("School not found");
      await expect(exams.listExamPapers(teacher, { schoolId: third.schoolId })).rejects.toThrow("School not found");
    });

    dbIt("the second school's own admin still sees every subject, and other schools' admins and organizations see nothing", async () => {
      const list = await exams.listExams(secondAdmin, second.schoolId);
      expect(subjectIdsOf(list[0].examSubjects)).toEqual([second.subjectId, second.otherSubjectId].sort());

      await expect(exams.listExams(homeAdmin, second.schoolId)).rejects.toThrow("School not found");
      await expect(exams.listExams(otherOrgTeacher, second.schoolId)).rejects.toThrow("School not found");
    });

    dbIt("the admin-only review listing keeps the strict gate — the teacher-aware one is opt-in", async () => {
      await expect(exams.listResultSubmissions(teacher, { schoolId: second.schoolId })).rejects.toThrow("School not found");
    });
  });

  describe("revocation", () => {
    dbIt("removing the assignment removes the access immediately", async () => {
      await prisma.teacherAssignment.delete({ where: { id: assignmentId } });

      await expect(exams.getResultsForSection(teacher, ...resultsPath(second), second.sectionAId)).rejects.toThrow("School not found");
      await expect(attendance.getForSectionAndDate(teacher, second.schoolId, second.sectionAId, "2027-03-01")).rejects.toThrow("School not found");
      await expect(exams.listExams(teacher, second.schoolId)).rejects.toThrow("School not found");
      await expect(exams.listExamSubjects(teacher, second.schoolId, second.examId)).rejects.toThrow("School not found");
      expect(teacherRowId).toBeDefined();
    });
  });
});
