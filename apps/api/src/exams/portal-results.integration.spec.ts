import { NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import type { AuthenticatedUser } from "../auth/types/authenticated-user";
import { SchoolsService } from "../schools/schools.service";
import { GuardiansService } from "../guardians/guardians.service";
import { GuardianPortalService } from "../guardians/guardian-portal.service";
import { StudentPortalService } from "../students/student-portal.service";
import { ExamsService } from "./exams.service";
import type { AuditService } from "../audit/audit.service";
import type { DocumentsService } from "../documents/documents.service";
import type { NotificationsService } from "../notifications/notifications.service";

// REAL-DATABASE test of the Student Portal and Parent Portal results and
// attendance reads (runs only when DATABASE_URL is set, as in CI's api job).
// The mock-based specs prove the where-clauses; this proves the real rows
// come back right: published-only, Term 1 / Term 2 / Annual, ownership,
// parent-child linkage, and academic-year isolation, against real Postgres.
const describeWithDb = process.env.DATABASE_URL ? describe : describe.skip;

// A developer machine may have DATABASE_URL configured but no database running.
// There these tests warn and return; in CI an unreachable database is a hard
// failure, never a silent pass.
let dbAvailable = true;
function dbIt(name: string, fn: () => Promise<void> | void) {
  it(name, async () => {
    if (!dbAvailable) {
      console.warn(`[portal-results integration] no database reachable - not run: ${name}`);
      return;
    }
    await fn();
  });
}

describeWithDb("Student & Parent portals — results and attendance, real database", () => {
  const prisma = new PrismaService();
  const audit = { record: jest.fn().mockResolvedValue(undefined) } as unknown as AuditService;
  const documents = { tryGetPhotoUrl: jest.fn().mockResolvedValue(null) } as unknown as DocumentsService;
  const notifications = { notifyUser: jest.fn(), notifySchoolStaffWithPermission: jest.fn() } as unknown as NotificationsService;
  const schools = new SchoolsService(prisma, audit);
  const exams = new ExamsService(prisma, schools, audit, documents, notifications);
  const guardians = new GuardiansService(prisma, schools, audit);
  const studentPortal = new StudentPortalService(prisma);
  const parentPortal = new GuardianPortalService(prisma, guardians);

  const tag = `pr${Date.now().toString(36)}`;
  const created = { orgIds: [] as string[], userIds: [] as string[], studentIds: [] as string[], guardianIds: [] as string[] };

  let orgId: string;
  let schoolId: string;
  let year2026: string;
  let year2027: string;
  let otherSchoolYear: string;
  let sectionId: string;
  let subjectId: string;

  // Two students who share a class in 2027; A additionally has a 2026 history.
  let studentA: { id: string; actor: AuthenticatedUser; enr2027: string; enr2026: string };
  let studentB: { id: string; actor: AuthenticatedUser; enr2027: string };
  let parentOfA: AuthenticatedUser;
  let parentOfB: AuthenticatedUser;
  let parentOfBoth: AuthenticatedUser;
  let notAGuardian: AuthenticatedUser;
  let term1Id: string;
  let term2Id: string;
  let term2SubmissionId: string;

  const actorOf = (id: string, role: string): AuthenticatedUser => ({
    id,
    email: `${id}@it.test`,
    organizationId: orgId,
    roles: [role],
    permissions: [],
    schoolIds: [],
  });

  async function makeUser(label: string) {
    const user = await prisma.user.create({ data: { email: `${label}.${tag}@it.test`, organizationId: orgId, status: "ACTIVE" } });
    created.userIds.push(user.id);
    return user;
  }

  async function makeStudent(first: string, withLogin: boolean) {
    const user = withLogin ? await makeUser(`student-${first}`) : null;
    const student = await prisma.student.create({
      data: { organizationId: orgId, userId: user?.id, firstName: first, lastName: tag, dateOfBirth: new Date("2011-01-01"), sex: "FEMALE" },
    });
    created.studentIds.push(student.id);
    return { student, user };
  }

  async function makeParent(label: string, studentIds: string[], status: "ACTIVE" | "INACTIVE" = "ACTIVE") {
    const user = await makeUser(`parent-${label}`);
    const guardian = await prisma.guardian.create({ data: { userId: user.id, firstName: label, lastName: tag } });
    created.guardianIds.push(guardian.id);
    for (const studentId of studentIds) {
      await prisma.studentGuardian.create({ data: { studentId, guardianId: guardian.id, relationship: "MOTHER", status } });
    }
    return actorOf(user.id, "PARENT");
  }

  // One published exam-subject result set for one (exam, enrollment): the
  // submission carries the visibility state, the Result carries the marks.
  async function enterResult(opts: {
    examSubjectId: string;
    enrollmentId: string;
    marks: number | null;
    absent?: boolean;
    status: "DRAFT" | "SUBMITTED" | "NEEDS_CORRECTION" | "APPROVED" | "PUBLISHED";
  }) {
    const submission = await prisma.resultSubmission.upsert({
      where: { examSubjectId_sectionId: { examSubjectId: opts.examSubjectId, sectionId } },
      update: {},
      create: {
        examSubjectId: opts.examSubjectId,
        sectionId,
        status: opts.status,
        publishedAt: opts.status === "PUBLISHED" ? new Date("2027-06-30") : null,
      },
    });
    await prisma.result.create({
      data: {
        examSubjectId: opts.examSubjectId,
        enrollmentId: opts.enrollmentId,
        resultSubmissionId: submission.id,
        marksObtained: opts.marks,
        isAbsent: opts.absent ?? false,
        enteredByUserId: "it-teacher",
      },
    });
    return submission;
  }

  async function makeExam(yearId: string, classId: string, termId: string | null, name: string, maxMarks: number) {
    const exam = await prisma.exam.create({ data: { schoolId, academicYearId: yearId, termId, name: `${name} ${tag}`, type: "FINAL" } });
    return prisma.examSubject.create({ data: { examId: exam.id, classId, subjectId, maxMarks } });
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
    orgId = org.id;
    created.orgIds.push(org.id);
    const school = await prisma.school.create({ data: { organizationId: orgId, name: `Saamalay ${tag}`, type: "SECONDARY" } });
    schoolId = school.id;
    const otherSchool = await prisma.school.create({ data: { organizationId: orgId, name: `Other ${tag}`, type: "SECONDARY" } });
    const division = await prisma.division.create({ data: { schoolId, type: "SECONDARY" } });

    const y26 = await prisma.academicYear.create({ data: { schoolId, name: "2026", startDate: new Date("2026-01-01"), endDate: new Date("2026-12-31"), isCurrent: false } });
    const y27 = await prisma.academicYear.create({ data: { schoolId, name: "2027", startDate: new Date("2027-01-01"), endDate: new Date("2027-12-31"), isCurrent: true } });
    const yOther = await prisma.academicYear.create({ data: { schoolId: otherSchool.id, name: "2027", startDate: new Date("2027-01-01"), endDate: new Date("2027-12-31"), isCurrent: true } });
    year2026 = y26.id;
    year2027 = y27.id;
    otherSchoolYear = yOther.id;

    // Terms: exactly "Term 1" / "Term 2" per year, weight 50/50.
    const t26 = [
      await prisma.term.create({ data: { academicYearId: y26.id, name: "Term 1", weight: 50 } }),
      await prisma.term.create({ data: { academicYearId: y26.id, name: "Term 2", weight: 50 } }),
    ];
    const t27 = [
      await prisma.term.create({ data: { academicYearId: y27.id, name: "Term 1", weight: 50 } }),
      await prisma.term.create({ data: { academicYearId: y27.id, name: "Term 2", weight: 50 } }),
    ];
    term1Id = t27[0].id;
    term2Id = t27[1].id;

    const form1 = await prisma.class.create({ data: { divisionId: division.id, name: "Form 1", level: 1 } });
    const form2 = await prisma.class.create({ data: { divisionId: division.id, name: "Form 2", level: 2 } });
    const sec1 = await prisma.section.create({ data: { classId: form1.id, name: "A" } });
    const sec2 = await prisma.section.create({ data: { classId: form2.id, name: "B" } });
    sectionId = sec2.id;
    const subject = await prisma.subject.create({ data: { schoolId, name: `Xisaab ${tag}` } });
    subjectId = subject.id;

    // Student A: PROMOTED in 2026 (Form 1) -> ACTIVE in 2027 (Form 2). Student B: ACTIVE in 2027 only.
    const a = await makeStudent("Ayaan", true);
    const b = await makeStudent("Bilan", true);
    const enrol = (studentId: string, yearId: string, classId: string, secId: string, status: "ACTIVE" | "PROMOTED", n: string, rollNumber: number) =>
      prisma.studentEnrollment.create({
        data: {
          studentId, organizationId: orgId, schoolId, academicYearId: yearId, classId, sectionId: secId, status,
          studentNumber: `STU-${tag}-${n}`, rollNumber, startDate: new Date(yearId === y26.id ? "2026-01-05" : "2027-01-05"),
        },
      });
    const a26 = await enrol(a.student.id, y26.id, form1.id, sec1.id, "PROMOTED", "a26", 1);
    const a27 = await enrol(a.student.id, y27.id, form2.id, sec2.id, "ACTIVE", "a27", 1);
    const b27 = await enrol(b.student.id, y27.id, form2.id, sec2.id, "ACTIVE", "b27", 2);
    studentA = { id: a.student.id, actor: actorOf(a.user!.id, "STUDENT"), enr2027: a27.id, enr2026: a26.id };
    studentB = { id: b.student.id, actor: actorOf(b.user!.id, "STUDENT"), enr2027: b27.id };

    // 2027 Term 1: PUBLISHED for both. A 80/100 + 10/50; B 30/100.
    const t1Math = await makeExam(y27.id, form2.id, t27[0].id, "T1 Math", 100);
    const t1Extra = await makeExam(y27.id, form2.id, t27[0].id, "T1 Quiz", 50);
    await enterResult({ examSubjectId: t1Math.id, enrollmentId: a27.id, marks: 80, status: "PUBLISHED" });
    await enterResult({ examSubjectId: t1Math.id, enrollmentId: b27.id, marks: 30, status: "PUBLISHED" });
    await enterResult({ examSubjectId: t1Extra.id, enrollmentId: a27.id, marks: 10, status: "PUBLISHED" });

    // 2027 Term 2: NOT published yet (starts SUBMITTED). A 60/100; B 90/100.
    const t2Math = await makeExam(y27.id, form2.id, t27[1].id, "T2 Math", 100);
    const t2Sub = await enterResult({ examSubjectId: t2Math.id, enrollmentId: a27.id, marks: 60, status: "SUBMITTED" });
    await enterResult({ examSubjectId: t2Math.id, enrollmentId: b27.id, marks: 90, status: "SUBMITTED" });
    term2SubmissionId = t2Sub.id;

    // A published ABSENT row in Term 1 (no mark) — must never surface as a 0.
    const t1Absent = await makeExam(y27.id, form2.id, t27[0].id, "T1 Oral", 40);
    await enterResult({ examSubjectId: t1Absent.id, enrollmentId: a27.id, marks: null, absent: true, status: "PUBLISHED" });

    // 2026 (historical) — both terms PUBLISHED for A: 70/100 and 90/100.
    const h1 = await makeExam(y26.id, form1.id, t26[0].id, "H1 Math", 100);
    const h2 = await makeExam(y26.id, form1.id, t26[1].id, "H2 Math", 100);
    // A different section for the historical submissions (the section belongs to the class of that year).
    const hsec = sec1.id;
    for (const [es, marks] of [[h1, 70], [h2, 90]] as const) {
      const sub = await prisma.resultSubmission.create({ data: { examSubjectId: es.id, sectionId: hsec, status: "PUBLISHED", publishedAt: new Date("2026-06-30") } });
      await prisma.result.create({ data: { examSubjectId: es.id, enrollmentId: a26.id, resultSubmissionId: sub.id, marksObtained: marks, enteredByUserId: "it-teacher" } });
    }

    // Attendance. A/2027: 03-01 Morning Present + Afternoon Absent; 03-02 Morning Present, Afternoon NOT recorded.
    const att = (enrollmentId: string, date: string, session: "MORNING" | "AFTERNOON", status: "PRESENT" | "ABSENT") =>
      prisma.attendance.create({ data: { enrollmentId, date: new Date(date), session, status, markedByUserId: "it-teacher" } });
    await att(a27.id, "2027-03-01", "MORNING", "PRESENT");
    await att(a27.id, "2027-03-01", "AFTERNOON", "ABSENT");
    await att(a27.id, "2027-03-02", "MORNING", "PRESENT");
    await att(a26.id, "2026-03-01", "MORNING", "PRESENT");
    await att(b27.id, "2027-03-01", "MORNING", "ABSENT");

    parentOfA = await makeParent("pa", [a.student.id]);
    parentOfB = await makeParent("pb", [b.student.id]);
    parentOfBoth = await makeParent("pab", [a.student.id, b.student.id]);
    notAGuardian = actorOf((await makeUser("nobody")).id, "PARENT");
  }, 90_000);

  afterAll(async () => {
    if (!dbAvailable) return;
    try {
      const schoolIds = (await prisma.school.findMany({ where: { organizationId: { in: created.orgIds } }, select: { id: true } })).map((s) => s.id);
      await prisma.attendance.deleteMany({ where: { enrollment: { schoolId: { in: schoolIds } } } });
      await prisma.result.deleteMany({ where: { enrollment: { schoolId: { in: schoolIds } } } });
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

  const marksOf = (report: { terms: Array<{ results: Array<{ marksObtained: number; maxMarks: number }> }> }, i: 0 | 1) =>
    report.terms[i].results.map((r) => [r.marksObtained, r.maxMarks]);

  describe("Student Portal — own published results", () => {
    dbIt("shows own published Term 1 results with marks, max marks and percentage; the term average is SUM/SUM", async () => {
      const report = await studentPortal.myResultsReport(studentA.actor, year2027);

      expect(marksOf(report, 0)).toEqual(expect.arrayContaining([[80, 100], [10, 50]]));
      expect(report.terms[0].results).toHaveLength(2);
      expect(report.terms[0].percentage).toBe(60); // (80+10)/(100+50)
      expect(report.terms[0].results.find((r) => r.maxMarks === 100)!.percentage).toBe(80);
    });

    dbIt("Term 2 is Incomplete while its submission is unpublished — for EVERY non-published state", async () => {
      for (const status of ["SUBMITTED", "DRAFT", "NEEDS_CORRECTION", "APPROVED"] as const) {
        await prisma.resultSubmission.update({ where: { id: term2SubmissionId }, data: { status, publishedAt: null } });
        const report = await studentPortal.myResultsReport(studentA.actor, year2027);

        expect(report.terms[1].results).toEqual([]);
        expect(report.terms[1].percentage).toBeNull();
        expect(report.annual).toMatchObject({ term2Percentage: null, annualPercentage: null, eligible: null });
      }
    });

    dbIt("never shows an absent student as 0/max", async () => {
      const report = await studentPortal.myResultsReport(studentA.actor, year2027);

      const oral = report.terms[0].results.filter((r) => r.maxMarks === 40);
      expect(oral).toEqual([]);
      expect(report.terms[0].percentage).toBe(60);
    });

    dbIt("once Term 2 is published, shows it and the annual/combined result with eligibility (Phase 1 calculation)", async () => {
      await prisma.resultSubmission.update({ where: { id: term2SubmissionId }, data: { status: "PUBLISHED", publishedAt: new Date("2027-07-01") } });

      const report = await studentPortal.myResultsReport(studentA.actor, year2027);

      expect(marksOf(report, 1)).toEqual([[60, 100]]);
      expect(report.annual).toEqual({ term1Percentage: 60, term2Percentage: 60, annualPercentage: 60, eligible: true, passMark: 50 });

      // The portal must agree, to the digit, with what promotion computes.
      expect(await exams.getAnnualResult(studentA.enr2027, year2027)).toEqual({
        term1Percentage: 60, term2Percentage: 60, annualPercentage: 60, eligible: true,
      });
      expect(await exams.getTermPercentage(studentA.enr2027, term1Id)).toBe(report.terms[0].percentage);
      expect(await exams.getTermPercentage(studentA.enr2027, term2Id)).toBe(report.terms[1].percentage);
    });

    dbIt("cannot see another student's results — B's marks never appear in A's report", async () => {
      const report = await studentPortal.myResultsReport(studentA.actor, year2027);
      const all = [...report.terms[0].results, ...report.terms[1].results, ...report.otherResults].map((r) => r.marksObtained);

      expect(all).not.toContain(30);
      expect(all).not.toContain(90);
      const bReport = await studentPortal.myResultsReport(studentB.actor, year2027);
      expect(bReport.terms[0].results.map((r) => r.marksObtained)).toEqual([30]);
    });

    dbIt("a student cannot address someone else at all: an academicYearId they were never enrolled in is NotFound", async () => {
      await expect(studentPortal.myResultsReport(studentA.actor, otherSchoolYear)).rejects.toThrow(NotFoundException);
      await expect(studentPortal.myResultsReport(studentB.actor, year2026)).rejects.toThrow(NotFoundException);
    });

    dbIt("an account with no Student profile gets nothing", async () => {
      await expect(studentPortal.myResultsReport(notAGuardian)).rejects.toThrow(NotFoundException);
      await expect(studentPortal.myAttendance(notAGuardian, year2027)).rejects.toThrow(NotFoundException);
    });
  });

  describe("academic-year isolation", () => {
    dbIt("the current year shows only 2027 data and the current class", async () => {
      const report = await studentPortal.myResultsReport(studentA.actor);

      expect(report.academicYear).toMatchObject({ id: year2027, name: "2027", isCurrent: true });
      expect(report.enrollment.className).toBe("Form 2");
      const all = [...report.terms[0].results, ...report.terms[1].results].map((r) => r.marksObtained);
      expect(all).not.toContain(70);
      expect(all).not.toContain(90 /* the 2026 Term 2 mark */);
    });

    dbIt("a historical year shows only its own results, term structure, annual result and class — from the PROMOTED enrollment", async () => {
      const report = await studentPortal.myResultsReport(studentA.actor, year2026);

      expect(report.academicYear).toMatchObject({ id: year2026, name: "2026", isCurrent: false });
      expect(report.enrollment.className).toBe("Form 1");
      expect(marksOf(report, 0)).toEqual([[70, 100]]);
      expect(marksOf(report, 1)).toEqual([[90, 100]]);
      expect(report.annual).toEqual({ term1Percentage: 70, term2Percentage: 90, annualPercentage: 80, eligible: true, passMark: 50 });
    });

    dbIt("attendance is year-scoped the same way: 2027 and 2026 never mix", async () => {
      const y27 = await studentPortal.myAttendance(studentA.actor, year2027);
      const y26 = await studentPortal.myAttendance(studentA.actor, year2026);

      expect(y27.records).toHaveLength(3);
      expect(y26.records).toHaveLength(1);
      expect(y26.records[0].className).toBe("Form 1");
      expect(y27.records.every((r) => r.className === "Form 2")).toBe(true);
    });
  });

  describe("attendance — two sessions, Not Recorded is not Absent", () => {
    dbIt("Student Portal: Morning Present / Afternoon Absent on one date, and Morning Present / Afternoon not recorded on the next", async () => {
      const { records, summary } = await studentPortal.myAttendance(studentA.actor, year2027);

      const byDate = new Map<string, Record<string, string>>();
      for (const r of records) {
        const key = r.date.toISOString().slice(0, 10);
        byDate.set(key, { ...(byDate.get(key) ?? {}), [r.session]: r.status });
      }
      expect(byDate.get("2027-03-01")).toEqual({ MORNING: "PRESENT", AFTERNOON: "ABSENT" });
      // No AFTERNOON key at all: Not Recorded — not a fabricated ABSENT.
      expect(byDate.get("2027-03-02")).toEqual({ MORNING: "PRESENT" });
      expect(summary).toMatchObject({ total: 3, present: 2, absent: 1 });
    });

    dbIt("Student Portal: another student's ABSENT mark never appears in my attendance", async () => {
      const { records } = await studentPortal.myAttendance(studentA.actor, year2027);
      const b = await studentPortal.myAttendance(studentB.actor, year2027);

      expect(records.filter((r) => r.status === "ABSENT")).toHaveLength(1);
      expect(records.every((r) => r.session === "MORNING" || r.session === "AFTERNOON")).toBe(true);
      expect(b.records.map((r) => [r.session, r.status])).toEqual([["MORNING", "ABSENT"]]);
    });

    dbIt("Parent Portal: the same two-session structure for a linked child", async () => {
      const { records } = await parentPortal.myChildAttendance(parentOfA, studentA.id, year2027);

      expect(records.map((r) => `${r.date.toISOString().slice(0, 10)} ${r.session} ${r.status}`).sort()).toEqual([
        "2027-03-01 AFTERNOON ABSENT",
        "2027-03-01 MORNING PRESENT",
        "2027-03-02 MORNING PRESENT",
      ]);
    });
  });

  describe("Parent Portal — linked child only", () => {
    dbIt("sees the linked child's Term 1, Term 2 and annual result", async () => {
      const report = await parentPortal.myChildResultsReport(parentOfA, studentA.id, year2027);

      expect(marksOf(report, 0)).toEqual(expect.arrayContaining([[80, 100], [10, 50]]));
      expect(marksOf(report, 1)).toEqual([[60, 100]]);
      expect(report.annual.annualPercentage).toBe(60);
      expect(report.annual.eligible).toBe(true);
    });

    dbIt("cannot see another parent's child — results or attendance (a NotFound, never a leak)", async () => {
      await expect(parentPortal.myChildResultsReport(parentOfB, studentA.id, year2027)).rejects.toThrow(NotFoundException);
      await expect(parentPortal.myChildResultsReport(parentOfA, studentB.id, year2027)).rejects.toThrow(NotFoundException);
      await expect(parentPortal.myChildAttendance(parentOfA, studentB.id, year2027)).rejects.toThrow(NotFoundException);
      await expect(parentPortal.myChildAcademicYears(parentOfA, studentB.id)).rejects.toThrow(NotFoundException);
    });

    dbIt("a user with no guardian profile cannot read any child", async () => {
      await expect(parentPortal.myChildResultsReport(notAGuardian, studentA.id)).rejects.toThrow(NotFoundException);
    });

    dbIt("cannot see unpublished results of their own child", async () => {
      await prisma.resultSubmission.update({ where: { id: term2SubmissionId }, data: { status: "APPROVED", publishedAt: null } });
      try {
        const report = await parentPortal.myChildResultsReport(parentOfA, studentA.id, year2027);

        expect(report.terms[1].results).toEqual([]);
        expect(report.annual.annualPercentage).toBeNull();
      } finally {
        await prisma.resultSubmission.update({ where: { id: term2SubmissionId }, data: { status: "PUBLISHED", publishedAt: new Date("2027-07-01") } });
      }
    });

    dbIt("a parent of two children gets each child's own data — never mixed", async () => {
      const a = await parentPortal.myChildResultsReport(parentOfBoth, studentA.id, year2027);
      const b = await parentPortal.myChildResultsReport(parentOfBoth, studentB.id, year2027);

      expect(marksOf(a, 0)).toEqual(expect.arrayContaining([[80, 100]]));
      expect(marksOf(b, 0)).toEqual([[30, 100]]);
      expect(marksOf(b, 1)).toEqual([[90, 100]]);
      const aAttendance = await parentPortal.myChildAttendance(parentOfBoth, studentA.id, year2027);
      const bAttendance = await parentPortal.myChildAttendance(parentOfBoth, studentB.id, year2027);
      expect(aAttendance.records).toHaveLength(3);
      expect(bAttendance.records).toHaveLength(1);
    });

    dbIt("a parent's historical-year view of their child is isolated from the current year", async () => {
      const report = await parentPortal.myChildResultsReport(parentOfA, studentA.id, year2026);

      expect(marksOf(report, 0)).toEqual([[70, 100]]);
      expect(report.enrollment.className).toBe("Form 1");
    });

    dbIt("an INACTIVE parent-child link stops all access immediately", async () => {
      const parent = await makeParent("pinactive", [studentA.id], "INACTIVE");

      await expect(parentPortal.myChildResultsReport(parent, studentA.id)).rejects.toThrow(NotFoundException);
      await expect(parentPortal.myChildAttendance(parent, studentA.id)).rejects.toThrow(NotFoundException);
    });
  });
});
