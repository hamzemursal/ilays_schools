import { BadRequestException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { Prisma } from "@school-erp/database";
import type { AuthenticatedUser } from "../auth/types/authenticated-user";
import { ExamsService } from "./exams.service";
import { PrismaService } from "../prisma/prisma.service";
import { SchoolsService } from "../schools/schools.service";
import { AuditService } from "../audit/audit.service";
import { DocumentsService } from "../documents/documents.service";
import { NotificationsService } from "../notifications/notifications.service";
import type { EnterMarksDto } from "./dto/enter-marks.dto";

// Phase 2 — teacher/admin marks editing, absent-is-not-zero, and the audit
// trail of every mark change. (The submit/approve/publish state machine has
// its own tests in exams.service.spec.ts; the ones here only re-check that it
// stays intact.)

const SCHOOL_ID = "school-1";
const OTHER_SCHOOL_ID = "school-2";
const EXAM_SUBJECT_ID = "examsubject-1";
const SECTION_ID = "section-1";

const TEACHER: AuthenticatedUser = {
  id: "teacher-user-1",
  email: "teacher@example.com",
  organizationId: "org-1",
  roles: ["TEACHER"],
  permissions: ["results.enter", "results.view"],
  schoolIds: [SCHOOL_ID],
};
const SCHOOL_ADMIN: AuthenticatedUser = {
  id: "admin-1",
  email: "admin@example.com",
  organizationId: "org-1",
  roles: ["SCHOOL_ADMIN"],
  permissions: ["results.enter", "results.approve", "results.view"],
  schoolIds: [SCHOOL_ID],
};
const SUPER_ADMIN: AuthenticatedUser = { ...SCHOOL_ADMIN, id: "super-1", roles: ["SUPER_ADMIN"], schoolIds: [] };

function examSubject(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: EXAM_SUBJECT_ID,
    examId: "exam-1",
    classId: "class-1",
    subjectId: "subject-1",
    maxMarks: 100,
    exam: { id: "exam-1", name: "Term 2 Exam", type: "FINAL", academicYearId: "year-1", academicYear: { id: "year-1", name: "2026-2027" }, school: { id: SCHOOL_ID, name: "Test School" } },
    class: { id: "class-1", name: "Form 2" },
    subject: { id: "subject-1", name: "Mathematics" },
    ...overrides,
  };
}

const ENROLLMENT = { id: "e1", studentId: "student-1", rollNumber: 1, student: { firstName: "Hodan", lastName: "Ali" } };

function setup(actor: AuthenticatedUser = SCHOOL_ADMIN) {
  const prisma = {
    examSubject: { findFirst: jest.fn().mockResolvedValue(examSubject()) },
    section: {
      findFirst: jest.fn().mockResolvedValue({ id: SECTION_ID, classId: "class-1" }),
      findUnique: jest.fn().mockResolvedValue({ id: SECTION_ID, name: "A" }),
    },
    studentEnrollment: { findMany: jest.fn().mockResolvedValue([ENROLLMENT]) },
    resultSubmission: {
      findUnique: jest.fn().mockResolvedValue({ id: "sub-1", status: "DRAFT", returnReason: null }),
      upsert: jest.fn().mockResolvedValue({ id: "sub-1" }),
      update: jest.fn().mockResolvedValue({}),
    },
    result: { findMany: jest.fn().mockResolvedValue([]), upsert: jest.fn().mockImplementation((a: unknown) => a) },
    teacher: { findFirst: jest.fn().mockResolvedValue(actor.roles.includes("TEACHER") ? { id: "teacher-1" } : null) },
    teacherAssignment: { findFirst: jest.fn().mockResolvedValue({ id: "assignment-1", teacherId: "teacher-1" }) },
    term: { findMany: jest.fn() },
    $transaction: jest.fn((arg: unknown) => Promise.all(arg as Promise<unknown>[])),
  };
  const schools = { findOneAccessibleOrThrow: jest.fn().mockResolvedValue(undefined), findOneAccessibleOrTeachingAtOrThrow: jest.fn().mockResolvedValue(undefined) };
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  const documents = { tryGetPhotoUrl: jest.fn().mockResolvedValue(null) };
  const notifications = { notifyUser: jest.fn().mockResolvedValue(undefined), notifySchoolStaffWithPermission: jest.fn() };
  const service = new ExamsService(
    prisma as unknown as PrismaService,
    schools as unknown as SchoolsService,
    audit as unknown as AuditService,
    documents as unknown as DocumentsService,
    notifications as unknown as NotificationsService,
  );
  // enterMarks ends by re-reading the whole section — that read path has its
  // own tests, and isn't what these are about.
  jest.spyOn(service, "getResultsForSection").mockResolvedValue({} as never);
  return { prisma, schools, audit, service, actor };
}

function dto(entries: EnterMarksDto["entries"]): EnterMarksDto {
  return { entries };
}
const save = (s: ReturnType<typeof setup>, entries: EnterMarksDto["entries"], schoolId = SCHOOL_ID) =>
  s.service.enterMarks(s.actor, schoolId, EXAM_SUBJECT_ID, SECTION_ID, dto(entries));

describe("Teacher marks editing — strictly scoped to the teacher's own assignment", () => {
  it("a teacher can increase an authorized student's existing mark, and the change is audited old → new", async () => {
    const s = setup(TEACHER);
    s.prisma.result.findMany.mockResolvedValue([{ enrollmentId: "e1", marksObtained: new Prisma.Decimal(60), isAbsent: false }]);

    await save(s, [{ enrollmentId: "e1", marksObtained: 75 }]);

    expect(s.prisma.result.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: { marksObtained: 75, isAbsent: false, enteredByUserId: TEACHER.id } }),
    );
    expect(s.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        actor: TEACHER,
        action: "RESULTS_CORRECTED",
        after: expect.objectContaining({
          changes: [{ enrollmentId: "e1", studentId: "student-1", studentName: "Hodan Ali", oldMark: 60, newMark: 75 }],
        }),
      }),
    );
  });

  it("a teacher can decrease a mark too", async () => {
    const s = setup(TEACHER);
    s.prisma.result.findMany.mockResolvedValue([{ enrollmentId: "e1", marksObtained: new Prisma.Decimal(80), isAbsent: false }]);

    await save(s, [{ enrollmentId: "e1", marksObtained: 55 }]);

    expect(s.prisma.result.upsert).toHaveBeenCalledWith(expect.objectContaining({ update: expect.objectContaining({ marksObtained: 55 }) }));
    expect(s.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ after: expect.objectContaining({ changes: [expect.objectContaining({ oldMark: 80, newMark: 55 })] }) }),
    );
  });

  it("checks the teacher's assignment for exactly this section + subject + academic year", async () => {
    const s = setup(TEACHER);

    await save(s, [{ enrollmentId: "e1", marksObtained: 70 }]);

    expect(s.prisma.teacherAssignment.findFirst).toHaveBeenCalledWith({
      where: { teacherId: "teacher-1", sectionId: SECTION_ID, subjectId: "subject-1", academicYearId: "year-1" },
    });
  });

  it("a teacher with no assignment for this class/section/subject/year cannot edit anything", async () => {
    const s = setup(TEACHER);
    s.prisma.teacherAssignment.findFirst.mockResolvedValue(null);

    await expect(save(s, [{ enrollmentId: "e1", marksObtained: 70 }])).rejects.toThrow(ForbiddenException);
    expect(s.prisma.result.upsert).not.toHaveBeenCalled();
    expect(s.audit.record).not.toHaveBeenCalled();
  });

  it("cannot edit a section that isn't part of the exam subject's class", async () => {
    const s = setup(TEACHER);
    s.prisma.section.findFirst.mockResolvedValue(null);

    await expect(save(s, [{ enrollmentId: "e1", marksObtained: 70 }])).rejects.toThrow(
      "That section does not belong to this exam subject's class",
    );
    expect(s.prisma.result.upsert).not.toHaveBeenCalled();
  });

  it("cannot edit another school's exam — the exam subject is looked up inside the URL's school only", async () => {
    const s = setup(TEACHER);
    s.prisma.examSubject.findFirst.mockResolvedValue(null); // not in that school

    await expect(save(s, [{ enrollmentId: "e1", marksObtained: 70 }], OTHER_SCHOOL_ID)).rejects.toThrow(NotFoundException);
    expect(s.prisma.examSubject.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: EXAM_SUBJECT_ID, exam: { schoolId: OTHER_SCHOOL_ID } } }),
    );
    expect(s.prisma.result.upsert).not.toHaveBeenCalled();
  });

  it("cannot edit a school the actor isn't authorized for — school access is enforced first", async () => {
    const s = setup(TEACHER);
    s.schools.findOneAccessibleOrTeachingAtOrThrow.mockRejectedValue(new NotFoundException("School not found"));

    await expect(save(s, [{ enrollmentId: "e1", marksObtained: 70 }])).rejects.toThrow("School not found");
    expect(s.prisma.result.upsert).not.toHaveBeenCalled();
  });

  it("cannot mark another section's / another year's / another school's student — the enrollment must be in THIS section and THIS exam's year", async () => {
    const s = setup(TEACHER);
    s.prisma.studentEnrollment.findMany.mockResolvedValue([]); // no such enrollment in this section+year

    await expect(save(s, [{ enrollmentId: "someone-elses-student", marksObtained: 70 }])).rejects.toThrow(
      "These enrollments aren't active in this section: someone-elses-student",
    );

    const where = s.prisma.studentEnrollment.findMany.mock.calls[0][0].where;
    expect(where).toMatchObject({ sectionId: SECTION_ID, academicYearId: "year-1", id: { in: ["someone-elses-student"] } });
    expect(s.prisma.result.upsert).not.toHaveBeenCalled();
  });

  it("a student who has since moved on can still have an ALREADY-recorded result corrected, but never gets a brand-new one", async () => {
    const s = setup(SCHOOL_ADMIN);

    await save(s, [{ enrollmentId: "e1", marksObtained: 70 }]);

    const where = s.prisma.studentEnrollment.findMany.mock.calls[0][0].where;
    expect(where.OR).toEqual([{ status: "ACTIVE" }, { results: { some: { examSubjectId: EXAM_SUBJECT_ID } } }]);
  });
});

describe("Admin marks correction — existing RBAC and school scope", () => {
  it("a School Admin can correct a mark once the results were returned for correction, and the audit carries the return reason", async () => {
    const s = setup(SCHOOL_ADMIN);
    s.prisma.resultSubmission.findUnique.mockResolvedValue({ id: "sub-1", status: "NEEDS_CORRECTION", returnReason: "Hodan's Maths mark was mistyped" });
    s.prisma.result.findMany.mockResolvedValue([{ enrollmentId: "e1", marksObtained: new Prisma.Decimal(40), isAbsent: false }]);

    await save(s, [{ enrollmentId: "e1", marksObtained: 90 }]);

    expect(s.prisma.teacherAssignment.findFirst).not.toHaveBeenCalled(); // admins aren't assignment-scoped
    expect(s.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        actor: SCHOOL_ADMIN,
        action: "RESULTS_CORRECTED",
        severity: "WARNING",
        reason: "Hodan's Maths mark was mistyped",
        after: expect.objectContaining({ changes: [expect.objectContaining({ oldMark: 40, newMark: 90 })] }),
      }),
    );
  });

  it("a School Admin is still restricted to their own school", async () => {
    const s = setup(SCHOOL_ADMIN);
    s.schools.findOneAccessibleOrTeachingAtOrThrow.mockRejectedValue(new NotFoundException("School not found"));

    await expect(save(s, [{ enrollmentId: "e1", marksObtained: 90 }], OTHER_SCHOOL_ID)).rejects.toThrow("School not found");
    expect(s.schools.findOneAccessibleOrTeachingAtOrThrow).toHaveBeenCalledWith(SCHOOL_ADMIN, OTHER_SCHOOL_ID);
    expect(s.prisma.result.upsert).not.toHaveBeenCalled();
  });

  it("a Super Admin (org-wide, no schoolIds) can correct a mark through the same school-access check", async () => {
    const s = setup(SUPER_ADMIN);
    s.prisma.result.findMany.mockResolvedValue([{ enrollmentId: "e1", marksObtained: new Prisma.Decimal(50), isAbsent: false }]);

    await save(s, [{ enrollmentId: "e1", marksObtained: 65 }]);

    expect(s.schools.findOneAccessibleOrTeachingAtOrThrow).toHaveBeenCalledWith(SUPER_ADMIN, SCHOOL_ID);
    expect(s.prisma.result.upsert).toHaveBeenCalled();
    expect(s.audit.record).toHaveBeenCalledWith(expect.objectContaining({ actor: SUPER_ADMIN, action: "RESULTS_CORRECTED" }));
  });

  it("returns an APPROVED result set for correction (it used to be a dead end), recording where it was returned from", async () => {
    const s = setup(SCHOOL_ADMIN);
    s.prisma.resultSubmission.findUnique.mockResolvedValue({ id: "sub-1", status: "APPROVED" });
    s.prisma.teacherAssignment.findFirst.mockResolvedValue(null);

    await s.service.returnForCorrection(SCHOOL_ADMIN, SCHOOL_ID, EXAM_SUBJECT_ID, SECTION_ID, { reason: "Found a wrong mark after approval" });

    expect(s.prisma.resultSubmission.update).toHaveBeenCalledWith({
      where: { id: "sub-1" },
      data: expect.objectContaining({ status: "NEEDS_CORRECTION", returnReason: "Found a wrong mark after approval" }),
    });
    expect(s.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: "RESULTS_RETURNED", after: expect.objectContaining({ returnedFrom: "APPROVED" }) }),
    );
  });

  it("a PUBLISHED result set still can't be returned directly — it must be unpublished first, so publish rules are unchanged", async () => {
    const s = setup(SCHOOL_ADMIN);
    s.prisma.resultSubmission.findUnique.mockResolvedValue({ id: "sub-1", status: "PUBLISHED" });

    await expect(
      s.service.returnForCorrection(SCHOOL_ADMIN, SCHOOL_ID, EXAM_SUBJECT_ID, SECTION_ID, { reason: "x" }),
    ).rejects.toThrow(BadRequestException);
    expect(s.prisma.resultSubmission.update).not.toHaveBeenCalled();
  });

  it.each(["SUBMITTED", "APPROVED", "PUBLISHED"])("editing is still refused while the submission is %s — corrections go through 'return for correction'", async (status) => {
    const s = setup(SCHOOL_ADMIN);
    s.prisma.resultSubmission.findUnique.mockResolvedValue({ id: "sub-1", status });

    await expect(save(s, [{ enrollmentId: "e1", marksObtained: 90 }])).rejects.toThrow("can't be edited right now");
    expect(s.prisma.result.upsert).not.toHaveBeenCalled();
  });
});

describe("Mark audit trail", () => {
  it("first-time entry is recorded as RESULTS_ENTERED with no old mark", async () => {
    const s = setup(TEACHER);

    await save(s, [{ enrollmentId: "e1", marksObtained: 70 }]);

    expect(s.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "RESULTS_ENTERED",
        severity: "INFO",
        module: "Results",
        resourceType: "ExamSubject",
        resourceId: EXAM_SUBJECT_ID,
        resourceName: "Term 2 Exam · Form 2 · Section A · Mathematics",
        after: expect.objectContaining({
          examId: "exam-1",
          examName: "Term 2 Exam",
          subjectName: "Mathematics",
          maxMarks: 100,
          changes: [{ enrollmentId: "e1", studentId: "student-1", studentName: "Hodan Ali", oldMark: null, newMark: 70 }],
        }),
      }),
    );
  });

  it("re-saving unchanged marks records nothing — only real changes are audited", async () => {
    const s = setup(TEACHER);
    s.prisma.result.findMany.mockResolvedValue([{ enrollmentId: "e1", marksObtained: new Prisma.Decimal("70.00"), isAbsent: false }]);

    await save(s, [{ enrollmentId: "e1", marksObtained: 70 }]);

    expect(s.audit.record).not.toHaveBeenCalled();
  });

  it("in a mixed save, only the students whose mark actually changed appear in the audit entry", async () => {
    const s = setup(SCHOOL_ADMIN);
    s.prisma.studentEnrollment.findMany.mockResolvedValue([
      ENROLLMENT,
      { id: "e2", studentId: "student-2", student: { firstName: "Amina", lastName: "Yusuf" } },
    ]);
    s.prisma.result.findMany.mockResolvedValue([
      { enrollmentId: "e1", marksObtained: new Prisma.Decimal(70), isAbsent: false },
      { enrollmentId: "e2", marksObtained: new Prisma.Decimal(50), isAbsent: false },
    ]);

    await save(s, [
      { enrollmentId: "e1", marksObtained: 70 },
      { enrollmentId: "e2", marksObtained: 58 },
    ]);

    const after = s.audit.record.mock.calls[0][0].after;
    expect(after.enteredCount).toBe(2);
    expect(after.changedCount).toBe(1);
    expect(after.changes).toEqual([expect.objectContaining({ studentName: "Amina Yusuf", oldMark: 50, newMark: 58 })]);
  });
});

describe("Absent is not zero", () => {
  it("an absent student is stored with NO mark (null) and isAbsent = true — never a 0", async () => {
    const s = setup(TEACHER);

    await save(s, [{ enrollmentId: "e1", isAbsent: true }]);

    const upsert = s.prisma.result.upsert.mock.calls[0][0];
    expect(upsert.update).toEqual({ marksObtained: null, isAbsent: true, enteredByUserId: TEACHER.id });
    expect(upsert.create).toEqual(expect.objectContaining({ marksObtained: null, isAbsent: true }));
    expect(upsert.update.marksObtained).not.toBe(0);
  });

  it("the audit trail says ABSENT, not 0 — for a first entry, a mark → absent correction, and absent → mark", async () => {
    const s = setup(SCHOOL_ADMIN);
    await save(s, [{ enrollmentId: "e1", isAbsent: true }]);
    expect(s.audit.record.mock.calls[0][0].after.changes[0]).toMatchObject({ oldMark: null, newMark: "ABSENT" });

    s.audit.record.mockClear();
    s.prisma.result.findMany.mockResolvedValue([{ enrollmentId: "e1", marksObtained: new Prisma.Decimal(60), isAbsent: false }]);
    await save(s, [{ enrollmentId: "e1", isAbsent: true }]);
    expect(s.audit.record.mock.calls[0][0].after.changes[0]).toMatchObject({ oldMark: 60, newMark: "ABSENT" });

    s.audit.record.mockClear();
    s.prisma.result.findMany.mockResolvedValue([{ enrollmentId: "e1", marksObtained: null, isAbsent: true }]);
    await save(s, [{ enrollmentId: "e1", marksObtained: 45 }]);
    expect(s.audit.record.mock.calls[0][0].after.changes[0]).toMatchObject({ oldMark: "ABSENT", newMark: 45 });
  });

  it("rejects an entry that is both absent and carries a mark — a 0 is not 'absent'", async () => {
    const s = setup(TEACHER);

    await expect(save(s, [{ enrollmentId: "e1", isAbsent: true, marksObtained: 0 }])).rejects.toThrow(
      "can't be both absent and have a mark",
    );
    expect(s.prisma.result.upsert).not.toHaveBeenCalled();
  });

  it("rejects an entry with neither a mark nor an absence — nothing is silently turned into 0", async () => {
    const s = setup(TEACHER);

    await expect(save(s, [{ enrollmentId: "e1" }])).rejects.toThrow("needs a mark, or must be marked absent");
    expect(s.prisma.result.upsert).not.toHaveBeenCalled();
  });

  it("a genuine 0 is still a valid mark and stays a number (only absence is separate)", async () => {
    const s = setup(TEACHER);

    await save(s, [{ enrollmentId: "e1", marksObtained: 0 }]);

    expect(s.prisma.result.upsert.mock.calls[0][0].update).toEqual({ marksObtained: 0, isAbsent: false, enteredByUserId: TEACHER.id });
  });

  it("an absent student counts as resolved for the submit gate but contributes no marks, percentage or average", async () => {
    const s = setup(SCHOOL_ADMIN);
    (s.service.getResultsForSection as jest.Mock).mockRestore();
    s.prisma.studentEnrollment.findMany.mockResolvedValue([
      { id: "e1", studentId: "s1", studentNumber: "S1", rollNumber: 1, student: { firstName: "A", lastName: "One" }, results: [{ marksObtained: new Prisma.Decimal(80), isAbsent: false }] },
      { id: "e2", studentId: "s2", studentNumber: "S2", rollNumber: 2, student: { firstName: "B", lastName: "Two" }, results: [{ marksObtained: null, isAbsent: true }] },
      { id: "e3", studentId: "s3", studentNumber: "S3", rollNumber: 3, student: { firstName: "C", lastName: "Three" }, results: [] },
    ]);
    s.prisma.resultSubmission.findUnique.mockResolvedValue(null);
    s.prisma.teacherAssignment.findFirst.mockResolvedValue(null);

    const result = await s.service.getResultsForSection(SCHOOL_ADMIN, SCHOOL_ID, EXAM_SUBJECT_ID, SECTION_ID);

    const absent = result.students[1];
    expect(absent).toMatchObject({ isAbsent: true, hasMark: false, marksObtained: null, percentage: null });
    expect(result.completedCount).toBe(2); // the marked student and the absent one
    expect(result.absentCount).toBe(1);
    expect(result.missingCount).toBe(1); // only the student with nothing recorded
    expect(result.average).toBe(80); // not (80 + 0) / 2
    expect(result.lowest).toBe(80);
  });
});

describe("Result calculation reflects the corrected mark", () => {
  // A tiny in-memory results table wired to the service's own reads and
  // writes, so this exercises the real enterMarks → getTermPercentage path.
  function withFakeResultsTable(s: ReturnType<typeof setup>) {
    const table = new Map<string, { marksObtained: number | null; isAbsent: boolean }>();
    s.prisma.result.upsert.mockImplementation((a: { where: { examSubjectId_enrollmentId: { enrollmentId: string } }; update: { marksObtained: number | null; isAbsent: boolean } }) => {
      table.set(a.where.examSubjectId_enrollmentId.enrollmentId, { marksObtained: a.update.marksObtained, isAbsent: a.update.isAbsent });
      return Promise.resolve({});
    });
    s.prisma.result.findMany.mockImplementation((args: { where: { enrollmentId: string | { in: string[] }; isAbsent?: boolean } }) => {
      const ids = typeof args.where.enrollmentId === "string" ? [args.where.enrollmentId] : args.where.enrollmentId.in;
      return Promise.resolve(
        ids
          .filter((id) => table.has(id))
          .map((id) => ({ enrollmentId: id, ...table.get(id)!, marksObtained: table.get(id)!.marksObtained === null ? null : new Prisma.Decimal(table.get(id)!.marksObtained!), examSubject: { maxMarks: 100 } }))
          // The service's own where-clause decides whether absent rows are visible.
          .filter((r) => args.where.isAbsent === undefined || r.isAbsent === args.where.isAbsent),
      );
    });
    return table;
  }

  it("the Term percentage follows the correction: 40 → corrected to 80 → 80%", async () => {
    const s = setup(SCHOOL_ADMIN);
    withFakeResultsTable(s);

    await save(s, [{ enrollmentId: "e1", marksObtained: 40 }]);
    expect(await s.service.getTermPercentage("e1", "term-1")).toBe(40);

    s.prisma.resultSubmission.findUnique.mockResolvedValue({ id: "sub-1", status: "NEEDS_CORRECTION", returnReason: "typo" });
    await save(s, [{ enrollmentId: "e1", marksObtained: 80 }]);
    expect(await s.service.getTermPercentage("e1", "term-1")).toBe(80);
  });

  it("decreasing a mark lowers the Term percentage just as increasing raises it", async () => {
    const s = setup(SCHOOL_ADMIN);
    withFakeResultsTable(s);
    await save(s, [{ enrollmentId: "e1", marksObtained: 90 }]);
    s.prisma.resultSubmission.findUnique.mockResolvedValue({ id: "sub-1", status: "NEEDS_CORRECTION", returnReason: "typo" });

    await save(s, [{ enrollmentId: "e1", marksObtained: 55 }]);

    expect(await s.service.getTermPercentage("e1", "term-1")).toBe(55);
  });

  it("marking a student absent removes their result from the Term percentage — it becomes Incomplete (null), never 0%", async () => {
    const s = setup(SCHOOL_ADMIN);
    withFakeResultsTable(s);
    await save(s, [{ enrollmentId: "e1", marksObtained: 70 }]);
    s.prisma.resultSubmission.findUnique.mockResolvedValue({ id: "sub-1", status: "NEEDS_CORRECTION", returnReason: "was absent" });

    await save(s, [{ enrollmentId: "e1", isAbsent: true }]);

    expect(await s.service.getTermPercentage("e1", "term-1")).toBeNull();
  });

  it("the Term percentage query itself excludes absent rows, so absence can't be summed as 0 with the max in the denominator", async () => {
    const s = setup(SCHOOL_ADMIN);
    s.prisma.result.findMany.mockResolvedValue([]);

    await s.service.getTermPercentage("e1", "term-1");

    expect(s.prisma.result.findMany.mock.calls[0][0].where).toMatchObject({ isAbsent: false, resultSubmission: { status: "PUBLISHED" } });
  });
});

// The Admin-configured maximum (ExamSubject.maxMarks = 100 here) is the only
// upper bound a Teacher or Admin can enter against; neither can change it.
describe("Mark bounds: 0 <= mark <= the Admin-set maximum", () => {
  it.each([
    ["a Teacher", TEACHER],
    ["a School Admin", SCHOOL_ADMIN],
  ])("%s can enter 0 and exactly the maximum", async (_name, actor) => {
    const s = setup(actor);

    await save(s, [{ enrollmentId: "e1", marksObtained: 0 }]);
    await save(s, [{ enrollmentId: "e1", marksObtained: 100 }]);

    expect(s.prisma.result.upsert).toHaveBeenCalledTimes(2);
  });

  it.each([
    ["a Teacher", TEACHER],
    ["a School Admin", SCHOOL_ADMIN],
  ])("%s cannot enter a mark above the maximum, nor a negative mark", async (_name, actor) => {
    const s = setup(actor);

    await expect(save(s, [{ enrollmentId: "e1", marksObtained: 100.01 }])).rejects.toThrow("above the maximum of 100");
    await expect(save(s, [{ enrollmentId: "e1", marksObtained: -1 }])).rejects.toThrow("can't be negative");
    expect(s.prisma.result.upsert).not.toHaveBeenCalled();
    expect(s.audit.record).not.toHaveBeenCalled();
  });

  it("a rejected batch writes nothing: one bad mark blocks the whole save", async () => {
    const s = setup(TEACHER);

    await expect(
      save(s, [
        { enrollmentId: "e1", marksObtained: 50 },
        { enrollmentId: "e1", marksObtained: 101 },
      ]),
    ).rejects.toThrow("above the maximum of 100");
    expect(s.prisma.result.upsert).not.toHaveBeenCalled();
  });
});

describe("Mark validation messages name the student, the value and the limit", () => {
  it("an over-maximum mark: who, what value, what limit — not a bare enrollment id", async () => {
    const s = setup(TEACHER);

    await expect(save(s, [{ enrollmentId: "e1", marksObtained: 130 }])).rejects.toThrow("Hodan Ali (#1): 130 is above the maximum of 100");
  });

  it("a negative mark says it is below 0", async () => {
    const s = setup(TEACHER);

    await expect(save(s, [{ enrollmentId: "e1", marksObtained: -4 }])).rejects.toThrow("Hodan Ali (#1): -4 is below 0");
  });

  it("ROOT CAUSE of the confusing report: the page re-sends every row, so an ALREADY-SAVED mark above the maximum blocks a save the teacher typed nothing wrong into — and the message now says exactly that", async () => {
    const s = setup(TEACHER);
    s.prisma.result.findMany.mockResolvedValue([{ marksObtained: new Prisma.Decimal(150), isAbsent: false }]);

    await expect(save(s, [{ enrollmentId: "e1", marksObtained: 150 }])).rejects.toThrow(
      "Hodan Ali (#1) already has a saved mark of 150, which is above the maximum of 100. Correct that mark to continue.",
    );
    expect(s.prisma.result.upsert).not.toHaveBeenCalled();
  });

  it("a freshly typed over-maximum value is not mistaken for an already-saved one", async () => {
    const s = setup(TEACHER);
    s.prisma.result.findMany.mockResolvedValue([{ marksObtained: new Prisma.Decimal(60), isAbsent: false }]);

    await expect(save(s, [{ enrollmentId: "e1", marksObtained: 130 }])).rejects.toThrow("130 is above the maximum of 100");
    await expect(save(s, [{ enrollmentId: "e1", marksObtained: 130 }])).rejects.not.toThrow(/already has a saved mark/);
  });

  it("absent is a status, never a stored 0: an absent entry saves marksObtained null and isAbsent true", async () => {
    const s = setup(TEACHER);

    await save(s, [{ enrollmentId: "e1", isAbsent: true }]);

    expect(s.prisma.result.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: { marksObtained: null, isAbsent: true, enteredByUserId: TEACHER.id } }),
    );
  });

  it("an entry that is both absent and carries a mark is refused, by name", async () => {
    const s = setup(TEACHER);

    await expect(save(s, [{ enrollmentId: "e1", isAbsent: true, marksObtained: 0 }])).rejects.toThrow(
      "Hodan Ali (#1) can't be both absent and have a mark",
    );
  });
});
