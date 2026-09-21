import { randomUUID } from "crypto";
import { readFileSync } from "fs";
import { join } from "path";
import { PrismaService } from "../prisma/prisma.service";

// Phase 5B-1: classes and sections become academic-year scoped.
//
// REAL-DATABASE tests of the one-time backfill (class_year_backfill) and its
// rollback (class_year_rollback), which live in the
// 20260922000000_class_academic_year migration. They run the exact SQL that
// production will run, against a fixture shaped like the real production data
// (see the Phase 5A dry-run): ONE Form 3 used in 2025-2026 (3 PROMOTED + 17
// RETAINED enrollments, 21 exam subjects / submissions, 420 results, 7 teacher
// assignments, 7 subject links) and 2026-2027 (17 ACTIVE retained + 3 ACTIVE
// promoted into Form 4). Runs only when DATABASE_URL is set, as in CI's api job.
const describeWithDb = process.env.DATABASE_URL ? describe : describe.skip;

let dbAvailable = true;
function dbIt(name: string, fn: () => Promise<void> | void, timeout = 60_000) {
  it(
    name,
    async () => {
      if (!dbAvailable) {
        console.warn(`[class-year-backfill integration] no database reachable - not run: ${name}`);
        return;
      }
      await fn();
    },
    timeout,
  );
}

type Row = { r_kind: string; r_item: string; r_expected: bigint | null; r_actual: bigint | null; r_verdict: string | null };
const num = (v: bigint | number | null | undefined) => (v === null || v === undefined ? null : Number(v));

describeWithDb("Class/Section academic-year backfill — real database", () => {
  const prisma = new PrismaService();
  const tag = `cy${Date.now().toString(36)}`;
  const created = { orgIds: [] as string[], studentIds: [] as string[], runIds: [] as string[] };

  type Fixture = Awaited<ReturnType<typeof buildFixture>>;

  // ---- running the SQL functions --------------------------------------------------
  async function backfill(schoolId: string, dryRun: boolean): Promise<Row[]> {
    const rows = await prisma.$queryRaw<Row[]>`SELECT * FROM class_year_backfill(${dryRun}, ${schoolId})`;
    const run = rows.find((r) => r.r_item.startsWith("run id"));
    if (run?.r_verdict) created.runIds.push(run.r_verdict);
    return rows;
  }
  async function rollback(runId: string, dryRun: boolean): Promise<Row[]> {
    return prisma.$queryRaw<Row[]>`SELECT * FROM class_year_rollback(${runId}, ${dryRun})`;
  }
  const plan = (rows: Row[], startsWith: string) => num(rows.find((r) => r.r_kind === "PLAN" && r.r_item.startsWith(startsWith))?.r_actual);
  const runIdOf = (rows: Row[]) => rows.find((r) => r.r_item.startsWith("run id"))!.r_verdict!;

  // ---- the production-shaped fixture ----------------------------------------------
  async function buildFixture(label: string) {
    const org = await prisma.organization.create({ data: { name: `Org ${label} ${tag}` } });
    created.orgIds.push(org.id);
    const school = await prisma.school.create({ data: { organizationId: org.id, name: `SYL ${label} ${tag}`, type: "SECONDARY" } });
    const division = await prisma.division.create({ data: { schoolId: school.id, type: "SECONDARY" } });
    const y25 = await prisma.academicYear.create({
      data: { schoolId: school.id, name: "2025-2026", startDate: new Date("2025-08-01"), endDate: new Date("2026-06-01"), isCurrent: true },
    });
    const y26 = await prisma.academicYear.create({
      data: { schoolId: school.id, name: "2026-2027", startDate: new Date("2026-08-01"), endDate: new Date("2027-06-01"), isCurrent: false },
    });

    const subjectIds = Array.from({ length: 7 }, () => randomUUID());
    await prisma.subject.createMany({ data: subjectIds.map((id, i) => ({ id, schoolId: school.id, name: `Subject ${i + 1} ${tag}` })) });

    // Legacy shape: classes exist WITHOUT a year.
    const form3 = await prisma.class.create({ data: { divisionId: division.id, name: "Form 3", level: 3 } });
    const form4 = await prisma.class.create({ data: { divisionId: division.id, name: "Form 4", level: 4 } });
    const form3A = await prisma.section.create({ data: { classId: form3.id, name: "A" } });
    const form4A = await prisma.section.create({ data: { classId: form4.id, name: "A" } });
    await prisma.classSubject.createMany({
      data: [...subjectIds.map((subjectId) => ({ classId: form3.id, subjectId })), ...subjectIds.slice(0, 2).map((subjectId) => ({ classId: form4.id, subjectId }))],
    });

    const teacher = await prisma.teacher.create({
      data: { schoolId: school.id, employeeNumber: `EMP-${label}-${tag}`, firstName: "Test", lastName: "Teacher" },
    });

    const studentIds = Array.from({ length: 20 }, () => randomUUID());
    created.studentIds.push(...studentIds);
    await prisma.student.createMany({
      data: studentIds.map((id, i) => ({
        id, organizationId: org.id, firstName: `S${i + 1}`, lastName: `${label}${tag}`, dateOfBirth: new Date("2010-01-01"), sex: i % 2 ? "FEMALE" : "MALE",
      })),
    });

    // 2025-2026 Form 3 A: 3 PROMOTED (students 0..2) + 17 RETAINED (3..19). 2026-2027: 17 retained -> Form 3 A, 3 promoted -> Form 4 A.
    const e25 = studentIds.map(() => randomUUID());
    const e26 = studentIds.map(() => randomUUID());
    await prisma.studentEnrollment.createMany({
      data: studentIds.map((studentId, i) => ({
        id: e25[i], studentId, organizationId: org.id, schoolId: school.id, academicYearId: y25.id, classId: form3.id, sectionId: form3A.id,
        studentNumber: `STU-${tag}-${label}-${i + 1}`, rollNumber: i + 1, status: i < 3 ? ("PROMOTED" as const) : ("RETAINED" as const),
        startDate: new Date("2025-08-05"), endDate: new Date("2026-06-01"),
      })),
    });
    await prisma.studentEnrollment.createMany({
      data: studentIds.map((studentId, i) => ({
        id: e26[i], studentId, organizationId: org.id, schoolId: school.id, academicYearId: y26.id,
        classId: i < 3 ? form4.id : form3.id, sectionId: i < 3 ? form4A.id : form3A.id,
        studentNumber: `STU-${tag}-${label}-${i + 1}`, rollNumber: i < 3 ? i + 1 : i - 2, status: "ACTIVE" as const, startDate: new Date("2026-08-05"),
      })),
    });

    const batch = await prisma.promotionBatch.create({
      data: { schoolId: school.id, fromAcademicYearId: y25.id, toAcademicYearId: y26.id, initiatedByUserId: "it-admin", status: "CONFIRMED", confirmedAt: new Date() },
    });
    await prisma.promotionItem.createMany({
      data: studentIds.map((studentId, i) => ({
        batchId: batch.id, studentId, fromEnrollmentId: e25[i], toEnrollmentId: e26[i], outcome: i < 3 ? ("PROMOTED" as const) : ("RETAINED" as const),
      })),
    });

    // 3 exams x 7 subjects = 21 exam subjects, all in 2025-2026 on Form 3, each with a published submission and 20 results = 420.
    const examSubjectIds: string[] = [];
    const submissionIds: string[] = [];
    for (let x = 0; x < 3; x++) {
      const exam = await prisma.exam.create({ data: { schoolId: school.id, academicYearId: y25.id, name: `Exam ${x + 1} ${tag}`, type: "FINAL" } });
      const esIds = subjectIds.map(() => randomUUID());
      await prisma.examSubject.createMany({ data: subjectIds.map((subjectId, i) => ({ id: esIds[i], examId: exam.id, classId: form3.id, subjectId, maxMarks: 100 })) });
      examSubjectIds.push(...esIds);
    }
    for (const examSubjectId of examSubjectIds) {
      const submission = await prisma.resultSubmission.create({ data: { examSubjectId, sectionId: form3A.id, status: "PUBLISHED", publishedAt: new Date("2026-05-01") } });
      submissionIds.push(submission.id);
      await prisma.result.createMany({
        data: e25.map((enrollmentId, i) => ({
          examSubjectId, enrollmentId, resultSubmissionId: submission.id, marksObtained: 40 + ((i * 7) % 55), enteredByUserId: "it-teacher",
        })),
      });
    }
    await prisma.teacherAssignment.createMany({
      data: subjectIds.map((subjectId) => ({ teacherId: teacher.id, schoolId: school.id, academicYearId: y25.id, sectionId: form3A.id, subjectId })),
    });
    await prisma.attendance.createMany({
      data: [
        ...e25.map((enrollmentId) => ({ enrollmentId, date: new Date("2025-09-01"), status: "PRESENT" as const, markedByUserId: "it-teacher" })),
        ...e26.map((enrollmentId) => ({ enrollmentId, date: new Date("2026-09-01"), status: "PRESENT" as const, markedByUserId: "it-teacher" })),
      ],
    });

    return { org, school, division, y25, y26, form3, form4, form3A, form4A, subjectIds, studentIds, e25, e26, examSubjectIds, submissionIds, teacher };
  }

  // ---- snapshots: prove nothing but the class/section pointers moved -----------------
  const strip = (rows: Array<Record<string, unknown>>, omit: string[]) =>
    rows.map((r) => Object.fromEntries(Object.entries(r).filter(([k]) => !omit.includes(k)))).sort((a, b) => String(a.id ?? "").localeCompare(String(b.id ?? "")));

  // omitPointers = true ignores exactly the columns the backfill is allowed to change.
  async function snapshot(f: Fixture, omitPointers: boolean) {
    const schoolId = f.school.id;
    const ptr = (cols: string[]) => (omitPointers ? cols : []);
    return {
      students: strip(await prisma.student.findMany({ where: { organizationId: f.org.id } }), ["updatedAt"]),
      enrollments: strip(await prisma.studentEnrollment.findMany({ where: { schoolId } }), ["updatedAt", ...ptr(["classId", "sectionId"])]),
      results: strip(await prisma.result.findMany({ where: { enrollment: { schoolId } } }), ["updatedAt"]),
      attendance: strip(await prisma.attendance.findMany({ where: { enrollment: { schoolId } } }), ["updatedAt"]),
      exams: strip(await prisma.exam.findMany({ where: { schoolId } }), ["updatedAt"]),
      examSubjects: strip(await prisma.examSubject.findMany({ where: { exam: { schoolId } } }), [...ptr(["classId"])]),
      submissions: strip(await prisma.resultSubmission.findMany({ where: { examSubject: { exam: { schoolId } } } }), ["updatedAt", ...ptr(["sectionId"])]),
      assignments: strip(await prisma.teacherAssignment.findMany({ where: { schoolId } }), [...ptr(["sectionId"])]),
      promotionItems: strip(await prisma.promotionItem.findMany({ where: { batch: { schoolId } } }), []),
      teachers: strip(await prisma.teacher.findMany({ where: { schoolId } }), ["updatedAt"]),
    };
  }
  const counts = async (f: Fixture) => ({
    classes: await prisma.class.count({ where: { division: { schoolId: f.school.id } } }),
    sections: await prisma.section.count({ where: { class: { division: { schoolId: f.school.id } } } }),
    classSubjects: await prisma.classSubject.count({ where: { class: { division: { schoolId: f.school.id } } } }),
    enrollments: await prisma.studentEnrollment.count({ where: { schoolId: f.school.id } }),
    results: await prisma.result.count({ where: { enrollment: { schoolId: f.school.id } } }),
    attendance: await prisma.attendance.count({ where: { enrollment: { schoolId: f.school.id } } }),
    examSubjects: await prisma.examSubject.count({ where: { exam: { schoolId: f.school.id } } }),
    submissions: await prisma.resultSubmission.count({ where: { examSubject: { exam: { schoolId: f.school.id } } } }),
    assignments: await prisma.teacherAssignment.count({ where: { schoolId: f.school.id } }),
  });

  beforeAll(async () => {
    try {
      await prisma.$connect();
      // The migration must be applied; fail loudly (in CI) if it is not.
      await prisma.$queryRaw`SELECT 1 FROM pg_proc WHERE proname = 'class_year_backfill'`;
    } catch (error) {
      if (process.env.CI) throw error;
      dbAvailable = false;
    }
  });

  afterAll(async () => {
    if (!dbAvailable) return;
    try {
      const schoolIds = (await prisma.school.findMany({ where: { organizationId: { in: created.orgIds } }, select: { id: true } })).map((s) => s.id);
      await prisma.promotionBatch.deleteMany({ where: { schoolId: { in: schoolIds } } });
      await prisma.studentEnrollment.deleteMany({ where: { schoolId: { in: schoolIds } } });
      await prisma.teacher.deleteMany({ where: { schoolId: { in: schoolIds } } });
      await prisma.school.deleteMany({ where: { id: { in: schoolIds } } });
      await prisma.student.deleteMany({ where: { id: { in: created.studentIds } } });
      await prisma.organization.deleteMany({ where: { id: { in: created.orgIds } } });
      await prisma.classYearBackfillChange.deleteMany({ where: { runId: { in: created.runIds } } });
    } catch {
      /* leftovers are harmless: every name carries a unique tag */
    } finally {
      await prisma.$disconnect();
    }
  }, 120_000);

  // ---------------------------------------------------------------------------------------
  describe("dry run", () => {
    dbIt("reports the exact KEEP/ADD plan and every safety check passes, and writes NOTHING", async () => {
      const f = await buildFixture("dry");
      const before = await snapshot(f, false);
      const beforeCounts = await counts(f);

      const rows = await backfill(f.school.id, true);

      expect(rows.filter((r) => r.r_kind === "CHECK").map((r) => r.r_verdict)).toEqual(Array(7).fill("PASS"));
      expect(plan(rows, "classes to stamp")).toBe(2); // Form 3 (2025-2026) and Form 4 (2026-2027) keep their rows
      expect(plan(rows, "classes to add")).toBe(1); // Form 3 for 2026-2027
      expect(plan(rows, "sections to add")).toBe(1);
      expect(plan(rows, "class-subject links to add")).toBe(7); // Form 3's 7 subject links, copied
      expect(plan(rows, "enrollments to re-point")).toBe(17);
      expect(plan(rows, "exam subjects")).toBe(0);
      expect(plan(rows, "result submissions")).toBe(0);
      expect(plan(rows, "teacher assignments")).toBe(0);
      expect(plan(rows, "class fee structures")).toBe(0);

      expect(await counts(f)).toEqual(beforeCounts);
      expect(await snapshot(f, false)).toEqual(before);
      expect(await prisma.class.count({ where: { division: { schoolId: f.school.id }, academicYearId: { not: null } } })).toBe(0);
      expect(await prisma.classYearBackfillChange.count({ where: { runId: { in: created.runIds } } })).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------------------
  describe("backfill", () => {
    dbIt("stamps the original rows, adds Form 3 for 2026-2027 with its section and 7 subject links, and re-points only the 17 enrollments", async () => {
      const f = await buildFixture("map");
      const before = await counts(f);
      expect(before).toMatchObject({ classes: 2, sections: 2, classSubjects: 9, enrollments: 40, results: 420, examSubjects: 21, submissions: 21, assignments: 7, attendance: 40 });

      const rows = await backfill(f.school.id, false);
      expect(rows.find((r) => r.r_item.startsWith("classes added"))?.r_actual).toBe(1n);

      // counts: 2 -> 3 classes, 2 -> 3 sections, 9 -> 16 links; everything else unchanged
      expect(await counts(f)).toEqual({ ...before, classes: 3, sections: 3, classSubjects: 16 });

      // KEEP: the ORIGINAL rows survive with their ids, stamped with their earliest referenced year.
      expect((await prisma.class.findUniqueOrThrow({ where: { id: f.form3.id } })).academicYearId).toBe(f.y25.id);
      expect((await prisma.class.findUniqueOrThrow({ where: { id: f.form4.id } })).academicYearId).toBe(f.y26.id);
      expect((await prisma.section.findUniqueOrThrow({ where: { id: f.form3A.id } })).classId).toBe(f.form3.id);

      // ADD: a NEW Form 3 for 2026-2027, same division/name/level, with a copy of section A and the 7 links.
      const newForm3 = await prisma.class.findFirstOrThrow({ where: { divisionId: f.division.id, level: 3, academicYearId: f.y26.id }, include: { sections: true, classSubjects: true } });
      expect(newForm3.id).not.toBe(f.form3.id);
      expect(newForm3.name).toBe("Form 3");
      expect(newForm3.sections.map((s) => s.name)).toEqual(["A"]);
      expect(newForm3.sections[0].id).not.toBe(f.form3A.id);
      expect(newForm3.classSubjects.map((c) => c.subjectId).sort()).toEqual([...f.subjectIds].sort());

      // Exactly the 17 ACTIVE 2026-2027 Form 3 enrollments moved to the new class/section; nothing else did.
      const moved = await prisma.studentEnrollment.findMany({ where: { classId: newForm3.id } });
      expect(moved).toHaveLength(17);
      expect(new Set(moved.map((e) => e.sectionId))).toEqual(new Set([newForm3.sections[0].id]));
      expect(moved.every((e) => e.academicYearId === f.y26.id && e.status === "ACTIVE")).toBe(true);
      expect(await prisma.studentEnrollment.count({ where: { classId: f.form3.id, academicYearId: f.y25.id } })).toBe(20); // 2025-2026 stays on the original
      expect(await prisma.studentEnrollment.count({ where: { classId: f.form4.id, academicYearId: f.y26.id } })).toBe(3); // Form 4 untouched
      expect(await prisma.examSubject.count({ where: { classId: f.form3.id } })).toBe(21);
      expect(await prisma.resultSubmission.count({ where: { sectionId: f.form3A.id } })).toBe(21);
      expect(await prisma.teacherAssignment.count({ where: { sectionId: f.form3A.id } })).toBe(7);
    });

    dbIt("preserves every Student ID, Student Number, roll number, status, result, attendance record, exam, assignment and promotion link", async () => {
      const f = await buildFixture("keep");
      const before = await snapshot(f, true); // ignoring ONLY the class/section pointers the backfill may change

      await backfill(f.school.id, false);

      expect(await snapshot(f, true)).toEqual(before);
      const e = await prisma.studentEnrollment.findMany({ where: { schoolId: f.school.id } });
      expect(new Set(e.map((x) => x.studentId)).size).toBe(20); // the same 20 permanent students
      expect(e.filter((x) => x.academicYearId === f.y25.id).map((x) => x.studentNumber).sort()).toEqual(
        e.filter((x) => x.academicYearId === f.y26.id).map((x) => x.studentNumber).sort(), // historical Student Numbers carry through
      );
    });

    dbIt("is safe to run again: a second run changes nothing and creates no duplicate class or section", async () => {
      const f = await buildFixture("idem");
      await backfill(f.school.id, false);
      const afterFirst = await counts(f);
      const snap = await snapshot(f, false);
      const logged = await prisma.classYearBackfillChange.count({ where: { runId: { in: created.runIds } } });

      const again = await backfill(f.school.id, false);

      expect(again.map((r) => r.r_verdict)).toEqual(["NO-OP"]);
      expect(await counts(f)).toEqual(afterFirst);
      expect(await snapshot(f, false)).toEqual(snap);
      expect(await prisma.classYearBackfillChange.count({ where: { runId: { in: created.runIds } } })).toBe(logged);
    });

    dbIt("only touches the school it was asked for", async () => {
      const a = await buildFixture("scopeA");
      const b = await buildFixture("scopeB");

      await backfill(a.school.id, false);

      expect((await counts(a)).classes).toBe(3);
      expect(await counts(b)).toMatchObject({ classes: 2 });
      expect(await prisma.class.count({ where: { division: { schoolId: b.school.id }, academicYearId: { not: null } } })).toBe(0);
    });

    dbIt("keeps historical academic years reachable: each year's class holds exactly that year's roster and history", async () => {
      const f = await buildFixture("hist");
      await backfill(f.school.id, false);

      const byYear = async (yearId: string) =>
        prisma.studentEnrollment.count({ where: { schoolId: f.school.id, academicYearId: yearId, class: { academicYearId: yearId } } });
      expect(await byYear(f.y25.id)).toBe(20);
      expect(await byYear(f.y26.id)).toBe(20);
      // 2025-2026 results are still reachable through the class of THAT year.
      expect(await prisma.result.count({ where: { enrollment: { schoolId: f.school.id }, examSubject: { class: { academicYearId: f.y25.id } } } })).toBe(420);
      // Every enrollment's class and section agree with each other and with its own year.
      const mismatched = await prisma.$queryRaw<{ n: bigint }[]>`
        SELECT count(*) AS n FROM student_enrollments en JOIN classes c ON c.id = en."classId" JOIN sections s ON s.id = en."sectionId"
        WHERE en."schoolId" = ${f.school.id} AND (c."academicYearId" <> en."academicYearId" OR s."classId" <> c.id)`;
      expect(Number(mismatched[0].n)).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------------------
  describe("refuses unsafe data — atomically, changing nothing", () => {
    async function expectRefusedAndUntouched(f: Fixture, why: RegExp, alreadyStamped = 0) {
      const before = await snapshot(f, false);
      const beforeCounts = await counts(f);
      const dry = await backfill(f.school.id, true);
      expect(dry.filter((r) => r.r_kind === "CHECK" && r.r_verdict === "FAIL").length).toBeGreaterThan(0);
      await expect(backfill(f.school.id, false)).rejects.toThrow(/class_year_backfill refused/);
      expect(await counts(f)).toEqual(beforeCounts);
      expect(await snapshot(f, false)).toEqual(before);
      expect(await prisma.class.count({ where: { division: { schoolId: f.school.id }, academicYearId: { not: null } } })).toBe(alreadyStamped);
      expect(dry.find((r) => r.r_verdict === "FAIL")!.r_item).toMatch(why);
    }

    dbIt("a class that no year references (no year can be inferred)", async () => {
      const f = await buildFixture("orphan");
      await prisma.class.create({ data: { divisionId: f.division.id, name: "Form 1", level: 1 } });
      await expectRefusedAndUntouched(f, /no reference from any year/);
    });

    dbIt("a result whose enrollment belongs to a different year than its exam", async () => {
      const f = await buildFixture("mixed");
      // A 2026-2027 enrollment holding a result for a 2025-2026 exam subject: cannot be mapped by year.
      await prisma.result.create({
        data: { examSubjectId: f.examSubjectIds[0], enrollmentId: f.e26[5], resultSubmissionId: f.submissionIds[0], marksObtained: 50, enteredByUserId: "it-teacher" },
      });
      await expectRefusedAndUntouched(f, /results whose enrollment/);
    });

    dbIt("two years with the same start date (the keeper would be a guess)", async () => {
      const f = await buildFixture("tie");
      await prisma.academicYear.update({ where: { id: f.y26.id }, data: { startDate: f.y25.startDate } });
      await expectRefusedAndUntouched(f, /same start date/);
    });

    dbIt("an enrollment whose section belongs to a different class", async () => {
      const f = await buildFixture("badsec");
      await prisma.studentEnrollment.update({ where: { id: f.e25[7] }, data: { sectionId: f.form4A.id } });
      await expectRefusedAndUntouched(f, /section is not part of their own class/);
    });

    dbIt("a plan that would collide with a class that already owns (division, level, year)", async () => {
      const f = await buildFixture("taken");
      const other = await prisma.class.create({ data: { divisionId: f.division.id, name: "Form 3 (manual)", level: 3, academicYearId: f.y26.id } });
      expect(other.academicYearId).toBe(f.y26.id);
      await expectRefusedAndUntouched(f, /already taken by another class/, 1); // only the manual class is stamped
    });
  });

  // ---------------------------------------------------------------------------------------
  describe("atomicity", () => {
    dbIt("if the built-in verification fails AFTER rows were written, everything is rolled back (fault injection)", async () => {
      const f = await buildFixture("fault");
      const before = await snapshot(f, false);
      const beforeCounts = await counts(f);

      // A faulty copy of the real function: it writes and logs everything but forgets to re-point the enrollments.
      const migration = readFileSync(join(__dirname, "../../../../packages/database/prisma/migrations/20260922000000_class_academic_year/migration.sql"), "utf8");
      const real = migration.match(/CREATE OR REPLACE FUNCTION class_year_backfill[\s\S]*?\$fn\$;/)![0];
      const faulty = real
        .replace("class_year_backfill(p_dry_run", "class_year_backfill_faulty(p_dry_run")
        .replace(/ {2}UPDATE student_enrollments en SET "classId" = p\.new_class_id, "sectionId" = sm\.new_section_id[\s\S]*?AND sm\.old_section_id = en\."sectionId" AND sm\.year_id = en\."academicYearId";\n/, "");
      expect(faulty).not.toEqual(real.replace("class_year_backfill(p_dry_run", "class_year_backfill_faulty(p_dry_run")); // the fault really was injected

      await prisma.$executeRawUnsafe(faulty);
      try {
        await expect(prisma.$queryRaw`SELECT * FROM class_year_backfill_faulty(false, ${f.school.id})`).rejects.toThrow(/verification failed/);
      } finally {
        await prisma.$executeRawUnsafe("DROP FUNCTION IF EXISTS class_year_backfill_faulty(boolean, text)");
      }

      // New classes, sections, links, log rows and stamps were all undone with the failed statement.
      expect(await counts(f)).toEqual(beforeCounts);
      expect(await snapshot(f, false)).toEqual(before);
      expect(await prisma.class.count({ where: { division: { schoolId: f.school.id }, academicYearId: { not: null } } })).toBe(0);
      expect(await prisma.classYearBackfillChange.count({ where: { rowId: { in: [f.form3.id, f.form4.id] } } })).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------------------
  describe("rollback", () => {
    dbIt("restores the database EXACTLY (every column of every row) and removes only what the run added", async () => {
      const f = await buildFixture("rb");
      const before = await snapshot(f, false);
      const beforeCounts = await counts(f);

      const runId = runIdOf(await backfill(f.school.id, false));
      expect((await counts(f)).classes).toBe(3);

      const dry = await rollback(runId, true);
      expect(dry.filter((r) => r.r_kind === "CHECK").map((r) => r.r_verdict)).toEqual(["PASS", "PASS"]);
      expect((await counts(f)).classes).toBe(3); // a dry run changes nothing

      const done = await rollback(runId, false);
      expect(done.find((r) => r.r_item.startsWith("rows removed"))?.r_actual).toBe(9n); // 1 class + 1 section + 7 links
      expect(await counts(f)).toEqual(beforeCounts);
      expect(await snapshot(f, false)).toEqual(before);
      expect(await prisma.class.count({ where: { division: { schoolId: f.school.id }, academicYearId: { not: null } } })).toBe(0);

      // A rolled-back run cannot be rolled back twice ...
      await expect(rollback(runId, false)).rejects.toThrow(/already rolled back/);
      // ... but the backfill itself can be run again cleanly afterwards.
      await backfill(f.school.id, false);
      expect((await counts(f)).classes).toBe(3);
    });

    dbIt("refuses when a newer enrollment is already attached to the added class", async () => {
      const f = await buildFixture("rbnew");
      const runId = runIdOf(await backfill(f.school.id, false));
      const newForm3 = await prisma.class.findFirstOrThrow({ where: { divisionId: f.division.id, level: 3, academicYearId: f.y26.id }, include: { sections: true } });
      const newStudent = await prisma.student.create({
        data: { organizationId: f.org.id, firstName: "New", lastName: `Kid${tag}`, dateOfBirth: new Date("2011-01-01"), sex: "MALE" },
      });
      created.studentIds.push(newStudent.id);
      await prisma.studentEnrollment.create({
        data: { studentId: newStudent.id, organizationId: f.org.id, schoolId: f.school.id, academicYearId: f.y26.id, classId: newForm3.id, sectionId: newForm3.sections[0].id, studentNumber: `NEW-${tag}`, rollNumber: 99, status: "ACTIVE" },
      });
      const beforeCounts = await counts(f);

      const dry = await rollback(runId, true);
      expect(dry.find((r) => r.r_item.startsWith("newer rows attached"))?.r_verdict).toBe("FAIL");
      await expect(rollback(runId, false)).rejects.toThrow(/class_year_rollback refused/);
      expect(await counts(f)).toEqual(beforeCounts);
      expect(await prisma.class.count({ where: { divisionId: f.division.id, level: 3 } })).toBe(2); // both Form 3 rows still there
    });

    dbIt("refuses when a re-pointed row was changed by someone else since", async () => {
      const f = await buildFixture("rbchg");
      const runId = runIdOf(await backfill(f.school.id, false));
      const moved = await prisma.studentEnrollment.findFirstOrThrow({ where: { studentId: f.studentIds[10], academicYearId: f.y26.id } });
      await prisma.studentEnrollment.update({ where: { id: moved.id }, data: { classId: f.form4.id } });

      const dry = await rollback(runId, true);
      expect(dry.find((r) => r.r_item.startsWith("re-pointed values changed"))?.r_verdict).toBe("FAIL");
      await expect(rollback(runId, false)).rejects.toThrow(/class_year_rollback refused/);
      expect((await prisma.studentEnrollment.findUniqueOrThrow({ where: { id: moved.id } })).classId).toBe(f.form4.id); // untouched
    });
  });

  // ---------------------------------------------------------------------------------------
  describe("the new identity: School + Academic Year + Level", () => {
    dbIt("the same level may exist in different years, but not twice in one year", async () => {
      const f = await buildFixture("key");
      await backfill(f.school.id, false);

      // Form 4 for 2025-2026 is free (the original Form 4 row is stamped 2026-2027): allowed.
      const f4in25 = await prisma.class.create({ data: { divisionId: f.division.id, name: "Form 4", level: 4, academicYearId: f.y25.id } });
      expect(f4in25.academicYearId).toBe(f.y25.id);
      // A second Form 3 in a year that already has one: refused by the database.
      await expect(prisma.class.create({ data: { divisionId: f.division.id, name: "Form 3", level: 3, academicYearId: f.y26.id } })).rejects.toMatchObject({ code: "P2002" });
      // Sections stay unique per class (and therefore per year).
      const newForm3 = await prisma.class.findFirstOrThrow({ where: { divisionId: f.division.id, level: 3, academicYearId: f.y26.id } });
      await expect(prisma.section.create({ data: { classId: newForm3.id, name: "A" } })).rejects.toMatchObject({ code: "P2002" });
      await prisma.section.create({ data: { classId: newForm3.id, name: "B" } });
    });

    dbIt("the transitional guard keeps one un-stamped class per level, and a class still needs a real year to be stamped", async () => {
      const f = await buildFixture("guard");
      await prisma.class.create({ data: { divisionId: f.division.id, name: "Form 1", level: 1 } });
      await expect(prisma.class.create({ data: { divisionId: f.division.id, name: "Form 1 again", level: 1 } })).rejects.toMatchObject({ code: "P2002" });
      const otherYear = await prisma.academicYear.create({
        data: { schoolId: f.school.id, name: "2030-2031", startDate: new Date("2030-08-01"), endDate: new Date("2031-06-01") },
      });
      // A stamped class does not collide with an un-stamped one of the same level.
      await expect(prisma.class.create({ data: { divisionId: f.division.id, name: "Form 1 (2030)", level: 1, academicYearId: otherYear.id } })).resolves.toBeTruthy();
      // A year that still owns classes cannot be deleted (NO ACTION), while classes are what block it.
      await expect(prisma.academicYear.delete({ where: { id: otherYear.id } })).rejects.toBeTruthy();
    });
  });
});

// ---------------------------------------------------------------------------------------
// Static safety of the migration FILE itself (no database needed).
describe("20260922000000_class_academic_year migration file", () => {
  const sql = readFileSync(
    join(__dirname, "../../../../packages/database/prisma/migrations/20260922000000_class_academic_year/migration.sql"),
    "utf8",
  );
  const withoutComments = sql.replace(/--.*$/gm, "");
  // Foreign-key actions ("ON DELETE NO ACTION ON UPDATE CASCADE") are structure, not data changes.
  const outsideFunctions = withoutComments
    .replace(/\$fn\$[\s\S]*?\$fn\$/g, "")
    .replace(/ON (DELETE|UPDATE) (NO ACTION|CASCADE|RESTRICT|SET NULL)/gi, "");

  it("changes structure only: it never moves, writes or deletes a row by itself", () => {
    expect(outsideFunctions).not.toMatch(/\b(INSERT|UPDATE|DELETE|TRUNCATE)\b/i);
    expect(outsideFunctions).not.toMatch(/\bDROP\s+(TABLE|COLUMN|SCHEMA|DATABASE)\b/i);
    expect(outsideFunctions).not.toMatch(/\bSELECT\b/i); // nothing calls the backfill on deploy
  });

  it("only drops the old per-division level index, and adds a NULLABLE year column", () => {
    expect((outsideFunctions.match(/\bDROP\b/gi) ?? []).length).toBe(1);
    expect(outsideFunctions).toMatch(/DROP INDEX "classes_divisionId_level_key"/);
    expect(outsideFunctions).toMatch(/ADD COLUMN\s+"academicYearId" TEXT;/);
    expect(outsideFunctions).not.toMatch(/"academicYearId" TEXT NOT NULL/);
  });

  it("keeps the backfill dry-run by default and the rollback dry-run by default", () => {
    expect(sql).toMatch(/class_year_backfill\(p_dry_run boolean DEFAULT true/);
    expect(sql).toMatch(/class_year_rollback\(p_run_id text DEFAULT NULL, p_dry_run boolean DEFAULT true\)/);
  });

  it("the backfill never deletes: DELETE appears only inside the rollback function", () => {
    const backfillBody = sql.match(/FUNCTION class_year_backfill[\s\S]*?\$fn\$;/)![0].replace(/--.*$/gm, "");
    expect(backfillBody).not.toMatch(/\bDELETE\b/i);
    expect(backfillBody).not.toMatch(/\bTRUNCATE\b/i);
    expect(backfillBody).not.toMatch(/\bDROP\s+TABLE\s+(?!IF EXISTS _cyb_)/i);
  });
});
