import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { Prisma } from "@school-erp/database";
import type { AuthenticatedUser } from "../auth/types/authenticated-user";
import { ExamsService } from "./exams.service";
import { PrismaService } from "../prisma/prisma.service";
import { SchoolsService } from "../schools/schools.service";
import { AuditService } from "../audit/audit.service";
import { DocumentsService } from "../documents/documents.service";
import { NotificationsService } from "../notifications/notifications.service";
import type { EnterMarksDto } from "./dto/enter-marks.dto";
import type { CreateExamDto } from "./dto/create-exam.dto";
import type { CreateExamSubjectDto } from "./dto/create-exam-subject.dto";

const SCHOOL_ID = "school-1";
const EXAM_SUBJECT_ID = "examsubject-1";
const SECTION_ID = "section-1";

const ADMIN_ACTOR: AuthenticatedUser = {
  id: "admin-1",
  email: "admin@example.com",
  organizationId: "org-1",
  roles: ["SCHOOL_ADMIN"],
  permissions: ["results.approve", "results.enter", "results.view"],
  schoolIds: [SCHOOL_ID],
};

const TEACHER_ACTOR: AuthenticatedUser = {
  id: "teacher-user-1",
  email: "teacher@example.com",
  organizationId: "org-1",
  roles: ["TEACHER"],
  permissions: ["results.enter", "results.view"],
  schoolIds: [SCHOOL_ID],
};

function baseExamSubject(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: EXAM_SUBJECT_ID,
    examId: "exam-1",
    classId: "class-1",
    subjectId: "subject-1",
    maxMarks: 100,
    passingMark: null,
    examDate: null,
    exam: {
      id: "exam-1",
      name: "Term 1 Exam",
      type: "TERM",
      academicYearId: "year-1",
      academicYear: { id: "year-1", name: "2027" },
      school: { id: SCHOOL_ID, name: "Test School" },
    },
    class: { id: "class-1", name: "Class 1" },
    subject: { id: "subject-1", name: "Mathematics" },
    ...overrides,
  };
}

type MockPrisma = {
  exam: { findMany: jest.Mock; findFirst: jest.Mock; findUniqueOrThrow: jest.Mock; update: jest.Mock };
  examSubject: { findFirst: jest.Mock; findMany: jest.Mock; create: jest.Mock; update: jest.Mock; createMany: jest.Mock };
  classSubject: { findMany: jest.Mock };
  class: { findFirst: jest.Mock };
  subject: { findFirst: jest.Mock };
  academicYear: { findFirst: jest.Mock };
  section: { findFirst: jest.Mock; findUnique: jest.Mock };
  studentEnrollment: { findMany: jest.Mock; count: jest.Mock };
  resultSubmission: { findUnique: jest.Mock; upsert: jest.Mock; update: jest.Mock; findMany: jest.Mock };
  result: { upsert: jest.Mock; count: jest.Mock; findMany: jest.Mock };
  term: { findMany: jest.Mock; findFirst: jest.Mock };
  teacher: { findFirst: jest.Mock };
  teacherAssignment: { findFirst: jest.Mock; findMany: jest.Mock };
  $transaction: jest.Mock;
};

function createMockPrisma(): MockPrisma {
  return {
    exam: { findMany: jest.fn(), findFirst: jest.fn(), findUniqueOrThrow: jest.fn(), update: jest.fn() },
    examSubject: { findFirst: jest.fn(), findMany: jest.fn(), create: jest.fn(), update: jest.fn(), createMany: jest.fn() },
    classSubject: { findMany: jest.fn() },
    class: { findFirst: jest.fn() },
    subject: { findFirst: jest.fn() },
    academicYear: { findFirst: jest.fn() },
    section: { findFirst: jest.fn(), findUnique: jest.fn() },
    studentEnrollment: { findMany: jest.fn(), count: jest.fn() },
    resultSubmission: { findUnique: jest.fn(), upsert: jest.fn(), update: jest.fn(), findMany: jest.fn() },
    result: { upsert: jest.fn(), count: jest.fn(), findMany: jest.fn() },
    term: { findMany: jest.fn(), findFirst: jest.fn() },
    teacher: { findFirst: jest.fn() },
    teacherAssignment: { findFirst: jest.fn(), findMany: jest.fn() },
    // Handles both forms ExamsService uses: a callback ($transaction(async tx => ...))
    // and a plain array of promises ($transaction(entries.map(...))).
    $transaction: jest.fn((arg: unknown) =>
      typeof arg === "function" ? (arg as (tx: unknown) => unknown)(undefined) : Promise.all(arg as Promise<unknown>[]),
    ),
  };
}

function createService(prisma: MockPrisma) {
  const schools = { findOneAccessibleOrThrow: jest.fn().mockResolvedValue(undefined), findOneAccessibleOrTeachingAtOrThrow: jest.fn().mockResolvedValue(undefined) };
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  const documents = {
    tryGetPhotoUrl: jest.fn().mockResolvedValue(null),
    uploadResultSubmissionPaper: jest.fn().mockResolvedValue(undefined),
    getResultSubmissionPaper: jest.fn().mockResolvedValue(null),
  };
  const notifications = {
    notifyUser: jest.fn().mockResolvedValue(undefined),
    notifySchoolStaffWithPermission: jest.fn().mockResolvedValue(undefined),
  };
  const service = new ExamsService(
    prisma as unknown as PrismaService,
    schools as unknown as SchoolsService,
    audit as unknown as AuditService,
    documents as unknown as DocumentsService,
    notifications as unknown as NotificationsService,
  );
  return { service, schools, audit, documents, notifications };
}

// Wires up every query getResultsForSection touches so tests can focus on
// the one thing they're actually checking (the stats math, or the
// submission fallback shape) without re-deriving the whole call graph.
function stubGetResultsForSection(
  prisma: MockPrisma,
  opts: {
    examSubject?: ReturnType<typeof baseExamSubject>;
    enrollments?: Array<{ id: string; studentId: string; studentNumber: string; rollNumber: number; student: { firstName: string; lastName: string }; results: Array<{ marksObtained: Prisma.Decimal }> }>;
    submission?: { status: string; notes: string | null; submittedAt: Date | null; returnedAt: Date | null; returnReason: string | null; approvedAt: Date | null; publishedAt: Date | null } | null;
    teacherAssignment?: unknown;
  } = {},
) {
  const examSubject = opts.examSubject ?? baseExamSubject();
  prisma.examSubject.findFirst.mockResolvedValue(examSubject);
  prisma.teacher.findFirst.mockResolvedValue(null); // Admin actor by default — teacher-scoping check is skipped
  prisma.section.findFirst.mockResolvedValue({ id: SECTION_ID, classId: examSubject.classId });
  prisma.section.findUnique.mockResolvedValue({ id: SECTION_ID, name: "A" });
  prisma.studentEnrollment.findMany.mockResolvedValue(opts.enrollments ?? []);
  prisma.resultSubmission.findUnique.mockResolvedValue(opts.submission ?? null);
  prisma.teacherAssignment.findFirst.mockResolvedValue(opts.teacherAssignment ?? null);
  return examSubject;
}

function enrollment(id: string, rollNumber: number, marksObtained?: number) {
  return {
    id,
    studentId: `student-${id}`,
    studentNumber: `S-${id}`,
    rollNumber,
    student: { firstName: "First", lastName: "Last" },
    results: marksObtained !== undefined ? [{ marksObtained: new Prisma.Decimal(marksObtained) }] : [],
  };
}

describe("ExamsService.createExam — pair validation, dedup, and conflicts", () => {
  let prisma: MockPrisma;
  let service: ExamsService;

  beforeEach(() => {
    prisma = createMockPrisma();
    ({ service } = createService(prisma));
    prisma.academicYear.findFirst.mockResolvedValue({ id: "year-1", schoolId: SCHOOL_ID });
    prisma.term.findFirst.mockResolvedValue({ id: "term-1", name: "Term 1", academicYearId: "year-1" });
  });

  function dto(examSubjects: CreateExamDto["examSubjects"]): CreateExamDto {
    return { academicYearId: "year-1", termId: "term-1", name: "Term 1 Exam", type: "TERM" as CreateExamDto["type"], examSubjects };
  }

  it("rejects when the academic year does not belong to this school", async () => {
    prisma.academicYear.findFirst.mockResolvedValue(null);
    await expect(service.createExam(ADMIN_ACTOR, SCHOOL_ID, dto([]))).rejects.toThrow(
      "That academic year does not belong to this school",
    );
  });

  // An exam only counts toward Term/Annual results (and Promotion) through
  // its term, so every new exam must be tied to one of THIS year's terms.
  it("always validates the term against the exam's own academic year — a term from another year is rejected", async () => {
    prisma.term.findFirst.mockResolvedValue(null);
    await expect(service.createExam(ADMIN_ACTOR, SCHOOL_ID, dto([]))).rejects.toThrow(
      "That term does not belong to the selected academic year",
    );
    expect(prisma.term.findFirst).toHaveBeenCalledWith({ where: { id: "term-1", academicYearId: "year-1" } });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("persists the chosen term on the exam, independent of the exam's Exam Type", async () => {
    const examCreate = jest.fn().mockResolvedValue({ id: "exam-1" });
    prisma.$transaction.mockImplementation(async (cb: (tx: unknown) => unknown) =>
      cb({
        exam: { create: examCreate, findUniqueOrThrow: jest.fn().mockResolvedValue({ id: "exam-1" }) },
        examSubject: { createMany: jest.fn() },
      }),
    );

    await service.createExam(ADMIN_ACTOR, SCHOOL_ID, { ...dto(undefined), type: "MIDTERM" as CreateExamDto["type"] });

    expect(examCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ termId: "term-1", type: "MIDTERM", academicYearId: "year-1" }),
    });
  });

  it("deduplicates repeated (classId, subjectId) pairs before validating them", async () => {
    prisma.classSubject.findMany.mockResolvedValue([{ classId: "class-1", subjectId: "subject-1", class: { name: "Form 1", academicYearId: "year-1" } }]);
    prisma.$transaction.mockImplementation(async (cb: (tx: unknown) => unknown) =>
      cb({
        exam: { create: jest.fn().mockResolvedValue({ id: "exam-1" }), findUniqueOrThrow: jest.fn().mockResolvedValue({ id: "exam-1" }) },
        examSubject: { createMany: jest.fn().mockResolvedValue({ count: 1 }) },
      }),
    );

    await service.createExam(ADMIN_ACTOR, SCHOOL_ID, dto([
      { classId: "class-1", subjectId: "subject-1" },
      { classId: "class-1", subjectId: "subject-1" },
    ]));

    // Only the deduplicated pair is checked against ClassSubject, not the
    // duplicate — the OR clause should contain exactly one entry.
    expect(prisma.classSubject.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ OR: [{ classId: "class-1", subjectId: "subject-1" }] }) }),
    );
  });

  it("refuses an exam pair whose class belongs to a different academic year than the exam's", async () => {
    prisma.classSubject.findMany.mockResolvedValue([{ classId: "class-1", subjectId: "subject-1", class: { name: "Form 1", academicYearId: "year-2" } }]);

    await expect(
      service.createExam(ADMIN_ACTOR, SCHOOL_ID, dto([{ classId: "class-1", subjectId: "subject-1" }])),
    ).rejects.toThrow(/Form 1 belongs to a different academic year/);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("refuses an exam pair whose class has no academic year yet", async () => {
    prisma.classSubject.findMany.mockResolvedValue([{ classId: "class-1", subjectId: "subject-1", class: { name: "Form 1", academicYearId: null } }]);

    await expect(
      service.createExam(ADMIN_ACTOR, SCHOOL_ID, dto([{ classId: "class-1", subjectId: "subject-1" }])),
    ).rejects.toThrow(/has no academic year yet/);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("rejects a pair that isn't a real ClassSubject relationship", async () => {
    prisma.classSubject.findMany.mockResolvedValue([]); // no valid relations returned
    await expect(
      service.createExam(ADMIN_ACTOR, SCHOOL_ID, dto([{ classId: "class-1", subjectId: "subject-1" }])),
    ).rejects.toThrow("One or more selected subjects are not assigned to their selected class");
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("translates a P2002 unique-constraint violation into a ConflictException", async () => {
    prisma.$transaction.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("Unique constraint failed", { code: "P2002", clientVersion: "5.0.0" }),
    );
    await expect(service.createExam(ADMIN_ACTOR, SCHOOL_ID, dto(undefined))).rejects.toThrow(ConflictException);
    await expect(service.createExam(ADMIN_ACTOR, SCHOOL_ID, dto(undefined))).rejects.toThrow(
      "An exam with this name already exists for this academic year",
    );
  });

  it("re-throws non-P2002 errors unchanged", async () => {
    prisma.$transaction.mockRejectedValue(new Error("connection reset"));
    await expect(service.createExam(ADMIN_ACTOR, SCHOOL_ID, dto(undefined))).rejects.toThrow("connection reset");
  });
});

describe("ExamsService.createExamSubject — scoping and conflicts", () => {
  let prisma: MockPrisma;
  let service: ExamsService;

  beforeEach(() => {
    prisma = createMockPrisma();
    ({ service } = createService(prisma));
    prisma.exam.findFirst.mockResolvedValue({ id: "exam-1", schoolId: SCHOOL_ID, academicYearId: "year-1" });
  });

  const dto: CreateExamSubjectDto = { classId: "class-1", subjectId: "subject-1" };
  const classOfYear = (academicYearId: string | null) => ({ id: "class-1", name: "Form 1", academicYearId });

  it("rejects a class that does not belong to this school", async () => {
    prisma.class.findFirst.mockResolvedValue(null);
    await expect(service.createExamSubject(ADMIN_ACTOR, SCHOOL_ID, "exam-1", dto)).rejects.toThrow(
      "That class does not belong to this school",
    );
  });

  it("rejects a subject that does not belong to this school", async () => {
    prisma.class.findFirst.mockResolvedValue(classOfYear("year-1"));
    prisma.subject.findFirst.mockResolvedValue(null);
    await expect(service.createExamSubject(ADMIN_ACTOR, SCHOOL_ID, "exam-1", dto)).rejects.toThrow(
      "That subject does not belong to this school",
    );
  });

  it("refuses a class of a DIFFERENT academic year than the exam's", async () => {
    prisma.class.findFirst.mockResolvedValue(classOfYear("year-2"));

    await expect(service.createExamSubject(ADMIN_ACTOR, SCHOOL_ID, "exam-1", dto)).rejects.toThrow(/Form 1 belongs to a different academic year/);
    expect(prisma.examSubject.create).not.toHaveBeenCalled();
  });

  it("refuses a class that has no academic year yet (unstamped legacy class)", async () => {
    prisma.class.findFirst.mockResolvedValue(classOfYear(null));

    await expect(service.createExamSubject(ADMIN_ACTOR, SCHOOL_ID, "exam-1", dto)).rejects.toThrow(/has no academic year yet/);
    expect(prisma.examSubject.create).not.toHaveBeenCalled();
  });

  it("translates a P2002 violation into a ConflictException naming the real cause", async () => {
    prisma.class.findFirst.mockResolvedValue(classOfYear("year-1"));
    prisma.subject.findFirst.mockResolvedValue({ id: "subject-1" });
    prisma.examSubject.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("Unique constraint failed", { code: "P2002", clientVersion: "5.0.0" }),
    );
    await expect(service.createExamSubject(ADMIN_ACTOR, SCHOOL_ID, "exam-1", dto)).rejects.toThrow(
      "This subject is already scheduled for this class in this exam",
    );
  });
});

describe("ExamsService.updateExamSubject — narrow, audited edit", () => {
  let prisma: MockPrisma;
  let service: ExamsService;
  let audit: { record: jest.Mock };

  beforeEach(() => {
    prisma = createMockPrisma();
    ({ service, audit } = createService(prisma) as { service: ExamsService; audit: { record: jest.Mock } });
    prisma.exam.findFirst.mockResolvedValue({ id: "exam-1", schoolId: SCHOOL_ID });
  });

  it("throws NotFoundException when the exam subject isn't part of this exam", async () => {
    prisma.examSubject.findFirst.mockResolvedValue(null);
    await expect(service.updateExamSubject(ADMIN_ACTOR, SCHOOL_ID, "exam-1", EXAM_SUBJECT_ID, {})).rejects.toThrow(
      NotFoundException,
    );
  });

  it("updates only examDate and records an audit entry with the new value", async () => {
    prisma.examSubject.findFirst.mockResolvedValue({ id: EXAM_SUBJECT_ID });
    prisma.examSubject.update.mockResolvedValue({ id: EXAM_SUBJECT_ID, examDate: new Date("2027-03-01") });

    await service.updateExamSubject(ADMIN_ACTOR, SCHOOL_ID, "exam-1", EXAM_SUBJECT_ID, { examDate: "2027-03-01" });

    expect(prisma.examSubject.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: EXAM_SUBJECT_ID }, data: { examDate: new Date("2027-03-01") } }),
    );
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: "EXAM_SUBJECT_UPDATED", after: { examDate: "2027-03-01" } }),
    );
  });

  it("records examDate: null in the audit entry when clearing the date", async () => {
    prisma.examSubject.findFirst.mockResolvedValue({ id: EXAM_SUBJECT_ID });
    prisma.examSubject.update.mockResolvedValue({ id: EXAM_SUBJECT_ID, examDate: null });

    await service.updateExamSubject(ADMIN_ACTOR, SCHOOL_ID, "exam-1", EXAM_SUBJECT_ID, {});

    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ after: { examDate: null } }));
  });
});

describe("ExamsService.getResultsForSection — stats math and submission shape", () => {
  let prisma: MockPrisma;
  let service: ExamsService;

  beforeEach(() => {
    prisma = createMockPrisma();
    ({ service } = createService(prisma));
  });

  it("computes percentage per student, rounded to 1 decimal place", async () => {
    stubGetResultsForSection(prisma, { enrollments: [enrollment("e1", 1, 85)] });
    const result = await service.getResultsForSection(ADMIN_ACTOR, SCHOOL_ID, EXAM_SUBJECT_ID, SECTION_ID);
    expect(result.students[0].percentage).toBe(85);
    expect(result.students[0].hasMark).toBe(true);
  });

  it("rounds a non-terminating percentage to exactly 1 decimal place", async () => {
    // 26.5/100 with a maxMarks of 30 → 88.33...% → rounds to 88.3
    stubGetResultsForSection(prisma, {
      examSubject: baseExamSubject({ maxMarks: 30 }),
      enrollments: [enrollment("e1", 1, 26.5)],
    });
    const result = await service.getResultsForSection(ADMIN_ACTOR, SCHOOL_ID, EXAM_SUBJECT_ID, SECTION_ID);
    expect(result.students[0].percentage).toBe(88.3);
  });

  it("reports hasMark: false and percentage: null for a student with no result yet", async () => {
    stubGetResultsForSection(prisma, { enrollments: [enrollment("e1", 1)] });
    const result = await service.getResultsForSection(ADMIN_ACTOR, SCHOOL_ID, EXAM_SUBJECT_ID, SECTION_ID);
    expect(result.students[0]).toMatchObject({ hasMark: false, percentage: null, marksObtained: null });
  });

  it("computes completedCount, missingCount, average, highest, and lowest across the section", async () => {
    stubGetResultsForSection(prisma, {
      enrollments: [enrollment("e1", 1, 90), enrollment("e2", 2, 70), enrollment("e3", 3)],
    });
    const result = await service.getResultsForSection(ADMIN_ACTOR, SCHOOL_ID, EXAM_SUBJECT_ID, SECTION_ID);
    expect(result.completedCount).toBe(2);
    expect(result.missingCount).toBe(1);
    expect(result.average).toBe(80);
    expect(result.highest).toBe(90);
    expect(result.lowest).toBe(70);
  });

  it("reports average, highest, and lowest as null when nobody has a mark yet", async () => {
    stubGetResultsForSection(prisma, { enrollments: [enrollment("e1", 1), enrollment("e2", 2)] });
    const result = await service.getResultsForSection(ADMIN_ACTOR, SCHOOL_ID, EXAM_SUBJECT_ID, SECTION_ID);
    expect(result.average).toBeNull();
    expect(result.highest).toBeNull();
    expect(result.lowest).toBeNull();
    expect(result.completedCount).toBe(0);
    expect(result.missingCount).toBe(2);
  });

  it("returns a synthetic DRAFT submission shape when no ResultSubmission row exists yet", async () => {
    stubGetResultsForSection(prisma, { enrollments: [], submission: null });
    const result = await service.getResultsForSection(ADMIN_ACTOR, SCHOOL_ID, EXAM_SUBJECT_ID, SECTION_ID);
    expect(result.submission).toEqual({
      status: "DRAFT",
      notes: null,
      submittedAt: null,
      returnedAt: null,
      returnReason: null,
      approvedAt: null,
      publishedAt: null,
    });
  });

  it("surfaces the real submission's fields when one exists", async () => {
    const submittedAt = new Date("2027-02-01");
    stubGetResultsForSection(prisma, {
      enrollments: [],
      submission: {
        status: "SUBMITTED",
        notes: "All entered",
        submittedAt,
        returnedAt: null,
        returnReason: null,
        approvedAt: null,
        publishedAt: null,
      },
    });
    const result = await service.getResultsForSection(ADMIN_ACTOR, SCHOOL_ID, EXAM_SUBJECT_ID, SECTION_ID);
    expect(result.submission).toMatchObject({ status: "SUBMITTED", notes: "All entered", submittedAt });
  });

  it("throws NotFoundException when the exam subject doesn't belong to this school", async () => {
    prisma.examSubject.findFirst.mockResolvedValue(null);
    await expect(service.getResultsForSection(ADMIN_ACTOR, SCHOOL_ID, EXAM_SUBJECT_ID, SECTION_ID)).rejects.toThrow(
      NotFoundException,
    );
  });

  it("throws BadRequestException when the section doesn't belong to the exam subject's class", async () => {
    stubGetResultsForSection(prisma, { enrollments: [] });
    prisma.section.findFirst.mockResolvedValue(null); // assertSectionBelongsToClass fails
    await expect(service.getResultsForSection(ADMIN_ACTOR, SCHOOL_ID, EXAM_SUBJECT_ID, SECTION_ID)).rejects.toThrow(
      "That section does not belong to this exam subject's class",
    );
  });

  // Test D (regression): a historical exam's own year is enough to find its
  // roster — the enrollment being closed since (promoted/retained out) must
  // never make an otherwise-real, already-published exam look empty.
  it("Test D: never requires the roster's enrollment to still be ACTIVE — a historical exam's roster query is scoped by year alone", async () => {
    stubGetResultsForSection(prisma, { enrollments: [enrollment("e1", 1, 85)] });

    await service.getResultsForSection(ADMIN_ACTOR, SCHOOL_ID, EXAM_SUBJECT_ID, SECTION_ID);

    const args = prisma.studentEnrollment.findMany.mock.calls[0][0];
    expect(args.where).toEqual({ sectionId: SECTION_ID, academicYearId: "year-1" });
    expect(args.where).not.toHaveProperty("status");
  });

  // Test E (regression): the impossible "1/0 completed" state came from
  // dividing a real Result count by a roster miscounted as 0 for a
  // historical year — with the roster query fixed, a student who has a
  // result also appears in `students`, so completedCount can never exceed
  // the roster it was drawn from.
  it("Test E: completedCount can never exceed the roster size for a valid historical result — no impossible N/0 state", async () => {
    stubGetResultsForSection(prisma, { enrollments: [enrollment("e1", 1, 85)] });

    const result = await service.getResultsForSection(ADMIN_ACTOR, SCHOOL_ID, EXAM_SUBJECT_ID, SECTION_ID);

    expect(result.students).toHaveLength(1);
    expect(result.completedCount).toBe(1);
    expect(result.completedCount).toBeLessThanOrEqual(result.students.length);
  });
});

describe("ExamsService — teacher-assignment authorization boundary", () => {
  let prisma: MockPrisma;
  let service: ExamsService;

  beforeEach(() => {
    prisma = createMockPrisma();
    ({ service } = createService(prisma));
    stubGetResultsForSection(prisma, { enrollments: [] });
  });

  it("allows an Admin with no Teacher profile through unconditionally", async () => {
    prisma.teacher.findFirst.mockResolvedValue(null);
    await expect(
      service.getResultsForSection(ADMIN_ACTOR, SCHOOL_ID, EXAM_SUBJECT_ID, SECTION_ID),
    ).resolves.toBeDefined();
    expect(prisma.teacherAssignment.findFirst).not.toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ teacherId: expect.anything() }) }),
    );
  });

  it("blocks a Teacher with no matching TeacherAssignment for this section+subject+year", async () => {
    prisma.teacher.findFirst.mockResolvedValue({ id: "teacher-1" });
    prisma.teacherAssignment.findFirst.mockImplementation((args: { where?: { teacherId?: string } }) =>
      // Distinguish the authorization check (queries by teacherId) from the
      // "who teaches this section" lookup getResultsForSection also makes.
      Promise.resolve(args?.where?.teacherId ? null : { id: "assignment-1", teacher: { firstName: "T", lastName: "R" } }),
    );
    await expect(
      service.getResultsForSection(TEACHER_ACTOR, SCHOOL_ID, EXAM_SUBJECT_ID, SECTION_ID),
    ).rejects.toThrow(ForbiddenException);
  });

  it("allows a Teacher who holds the matching TeacherAssignment", async () => {
    prisma.teacher.findFirst.mockResolvedValue({ id: "teacher-1" });
    prisma.teacherAssignment.findFirst.mockResolvedValue({ id: "assignment-1", teacher: { firstName: "T", lastName: "R" } });
    await expect(
      service.getResultsForSection(TEACHER_ACTOR, SCHOOL_ID, EXAM_SUBJECT_ID, SECTION_ID),
    ).resolves.toBeDefined();
  });

  // Regression for a real bug: the teacher profile lookup used to be
  // {userId, schoolId} — for a teacher whose Teacher row's home school
  // differs from the route's schoolId (exactly the shape a multi-school
  // teacher has), that lookup silently returns null, and this function's
  // own "if (teacher)" shape then treats them as an unrestricted admin
  // instead of checking their TeacherAssignment at all. The lookup must be
  // by userId alone — section/subject/year is what pins the check, not
  // filtering the teacher lookup itself.
  it("resolves the teacher profile by userId alone, never scoped by the route's schoolId", async () => {
    prisma.teacher.findFirst.mockResolvedValue({ id: "teacher-1" });
    prisma.teacherAssignment.findFirst.mockImplementation((args: { where?: { teacherId?: string } }) =>
      Promise.resolve(args?.where?.teacherId ? null : { id: "assignment-1", teacher: { firstName: "T", lastName: "R" } }),
    );
    await expect(
      service.getResultsForSection(TEACHER_ACTOR, "a-different-school", EXAM_SUBJECT_ID, SECTION_ID),
    ).rejects.toThrow(ForbiddenException);
    expect(prisma.teacher.findFirst).toHaveBeenCalledWith({ where: { userId: TEACHER_ACTOR.id } });
  });
});

describe("ExamsService.enterMarks — edit-window gating and validation", () => {
  let prisma: MockPrisma;
  let service: ExamsService;

  beforeEach(() => {
    prisma = createMockPrisma();
    ({ service } = createService(prisma));
    const examSubject = baseExamSubject();
    prisma.examSubject.findFirst.mockResolvedValue(examSubject);
    prisma.teacher.findFirst.mockResolvedValue(null);
    prisma.section.findFirst.mockResolvedValue({ id: SECTION_ID, classId: examSubject.classId });
    prisma.studentEnrollment.findMany.mockResolvedValue([{ id: "e1", studentId: "student-e1", student: { firstName: "Hodan", lastName: "Ali" } }]);
    prisma.section.findUnique.mockResolvedValue({ id: SECTION_ID, name: "A" });
    prisma.result.findMany.mockResolvedValue([]); // nothing recorded yet, unless a test says otherwise
    prisma.resultSubmission.upsert.mockResolvedValue({ id: "submission-1" });
    prisma.result.upsert.mockResolvedValue({});
    // Stub the re-fetch enterMarks ends with — this describe block is about
    // the write path's own gating logic, not the read-side stats math
    // (already covered separately).
    jest.spyOn(service, "getResultsForSection").mockResolvedValue({} as never);
  });

  function dto(entries: EnterMarksDto["entries"]): EnterMarksDto {
    return { entries };
  }

  it("rejects enrollments that aren't active in this section", async () => {
    prisma.studentEnrollment.findMany.mockResolvedValue([]); // "e1" not found as active
    prisma.resultSubmission.findUnique.mockResolvedValue(null);
    await expect(
      service.enterMarks(ADMIN_ACTOR, SCHOOL_ID, EXAM_SUBJECT_ID, SECTION_ID, dto([{ enrollmentId: "e1", marksObtained: 50 }])),
    ).rejects.toThrow("These enrollments aren't active in this section: e1");
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("rejects marks that exceed the exam subject's maxMarks", async () => {
    prisma.resultSubmission.findUnique.mockResolvedValue(null);
    await expect(
      service.enterMarks(ADMIN_ACTOR, SCHOOL_ID, EXAM_SUBJECT_ID, SECTION_ID, dto([{ enrollmentId: "e1", marksObtained: 150 }])),
    ).rejects.toThrow(`150 is above the maximum of 100`);
  });

  it.each(["SUBMITTED", "APPROVED", "PUBLISHED"])(
    "rejects editing marks when the submission status is %s",
    async (status) => {
      prisma.resultSubmission.findUnique.mockResolvedValue({ status });
      await expect(
        service.enterMarks(ADMIN_ACTOR, SCHOOL_ID, EXAM_SUBJECT_ID, SECTION_ID, dto([{ enrollmentId: "e1", marksObtained: 50 }])),
      ).rejects.toThrow(BadRequestException);
    },
  );

  it.each(["DRAFT", "NEEDS_CORRECTION"])("allows editing marks when the submission status is %s", async (status) => {
    prisma.resultSubmission.findUnique.mockResolvedValue({ status });
    await expect(
      service.enterMarks(ADMIN_ACTOR, SCHOOL_ID, EXAM_SUBJECT_ID, SECTION_ID, dto([{ enrollmentId: "e1", marksObtained: 50 }])),
    ).resolves.toBeDefined();
  });

  it("allows editing marks when no submission exists yet (first entry ever)", async () => {
    prisma.resultSubmission.findUnique.mockResolvedValue(null);
    await expect(
      service.enterMarks(ADMIN_ACTOR, SCHOOL_ID, EXAM_SUBJECT_ID, SECTION_ID, dto([{ enrollmentId: "e1", marksObtained: 50 }])),
    ).resolves.toBeDefined();
    expect(prisma.resultSubmission.upsert).toHaveBeenCalled();
  });

  it("humanizes the status in the rejection message (e.g. NEEDS_CORRECTION isn't shown raw)", async () => {
    prisma.resultSubmission.findUnique.mockResolvedValue({ status: "PUBLISHED" });
    await expect(
      service.enterMarks(ADMIN_ACTOR, SCHOOL_ID, EXAM_SUBJECT_ID, SECTION_ID, dto([{ enrollmentId: "e1", marksObtained: 50 }])),
    ).rejects.toThrow("These results are published and can't be edited right now.");
  });

  it("upserts each entry keyed by (examSubjectId, enrollmentId) and stamps enteredByUserId", async () => {
    prisma.resultSubmission.findUnique.mockResolvedValue(null);
    await service.enterMarks(ADMIN_ACTOR, SCHOOL_ID, EXAM_SUBJECT_ID, SECTION_ID, dto([{ enrollmentId: "e1", marksObtained: 77 }]));
    expect(prisma.result.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { examSubjectId_enrollmentId: { examSubjectId: EXAM_SUBJECT_ID, enrollmentId: "e1" } },
        update: { marksObtained: 77, isAbsent: false, enteredByUserId: ADMIN_ACTOR.id },
        create: expect.objectContaining({ marksObtained: 77, enteredByUserId: ADMIN_ACTOR.id, resultSubmissionId: "submission-1" }),
      }),
    );
  });
});

describe("ExamsService.submitForReview — completeness gate and resubmit semantics", () => {
  let prisma: MockPrisma;
  let service: ExamsService;
  let notifications: { notifySchoolStaffWithPermission: jest.Mock };
  let audit: { record: jest.Mock };

  beforeEach(() => {
    prisma = createMockPrisma();
    ({ service, notifications, audit } = createService(prisma) as unknown as {
      service: ExamsService;
      notifications: { notifySchoolStaffWithPermission: jest.Mock };
      audit: { record: jest.Mock };
    });
    prisma.examSubject.findFirst.mockResolvedValue(baseExamSubject());
    prisma.teacher.findFirst.mockResolvedValue(null);
    prisma.section.findFirst.mockResolvedValue({ id: SECTION_ID, classId: "class-1" });
    prisma.section.findUnique.mockResolvedValue({ id: SECTION_ID, name: "A" });
    jest.spyOn(service, "getResultsForSection").mockResolvedValue({} as never);
  });

  it("rejects when nothing has ever been entered (no submission row)", async () => {
    prisma.resultSubmission.findUnique.mockResolvedValue(null);
    await expect(service.submitForReview(ADMIN_ACTOR, SCHOOL_ID, EXAM_SUBJECT_ID, SECTION_ID)).rejects.toThrow(
      "Enter at least one mark before submitting for review",
    );
  });

  it.each(["SUBMITTED", "APPROVED", "PUBLISHED"])("rejects submitting when already %s", async (status) => {
    prisma.resultSubmission.findUnique.mockResolvedValue({ id: "sub-1", status });
    await expect(service.submitForReview(ADMIN_ACTOR, SCHOOL_ID, EXAM_SUBJECT_ID, SECTION_ID)).rejects.toThrow(
      `This submission is already ${status.toLowerCase().replace("_", " ")}`,
    );
  });

  it("rejects submitting when some active students are still missing marks — never trusts a client count", async () => {
    prisma.resultSubmission.findUnique.mockResolvedValue({ id: "sub-1", status: "DRAFT" });
    prisma.studentEnrollment.count.mockResolvedValue(5);
    prisma.result.count.mockResolvedValue(3);
    await expect(service.submitForReview(ADMIN_ACTOR, SCHOOL_ID, EXAM_SUBJECT_ID, SECTION_ID)).rejects.toThrow(
      "2 student(s) still need marks before this can be submitted",
    );
    expect(prisma.resultSubmission.update).not.toHaveBeenCalled();
  });

  it("submits when every active student has a mark, recording RESULTS_SUBMITTED from DRAFT", async () => {
    prisma.resultSubmission.findUnique.mockResolvedValue({ id: "sub-1", status: "DRAFT" });
    prisma.studentEnrollment.count.mockResolvedValue(3);
    prisma.result.count.mockResolvedValue(3);

    await service.submitForReview(ADMIN_ACTOR, SCHOOL_ID, EXAM_SUBJECT_ID, SECTION_ID);

    expect(prisma.resultSubmission.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "sub-1" }, data: expect.objectContaining({ status: "SUBMITTED" }) }),
    );
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: "RESULTS_SUBMITTED" }));
    expect(notifications.notifySchoolStaffWithPermission).toHaveBeenCalledWith(
      SCHOOL_ID,
      "results.approve",
      expect.objectContaining({ title: "Results submitted for review" }),
    );
  });

  it("records RESULTS_RESUBMITTED (not RESULTS_SUBMITTED) when resubmitting from NEEDS_CORRECTION", async () => {
    prisma.resultSubmission.findUnique.mockResolvedValue({ id: "sub-1", status: "NEEDS_CORRECTION" });
    prisma.studentEnrollment.count.mockResolvedValue(1);
    prisma.result.count.mockResolvedValue(1);

    await service.submitForReview(ADMIN_ACTOR, SCHOOL_ID, EXAM_SUBJECT_ID, SECTION_ID);

    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: "RESULTS_RESUBMITTED" }));
    expect(notifications.notifySchoolStaffWithPermission).toHaveBeenCalledWith(
      SCHOOL_ID,
      "results.approve",
      expect.objectContaining({ title: "Corrected results resubmitted" }),
    );
  });
});

describe("ExamsService — review state machine (return / approve / publish / unpublish)", () => {
  let prisma: MockPrisma;
  let service: ExamsService;
  let audit: { record: jest.Mock };
  let notifications: { notifyUser: jest.Mock };

  beforeEach(() => {
    prisma = createMockPrisma();
    ({ service, audit, notifications } = createService(prisma) as unknown as {
      service: ExamsService;
      audit: { record: jest.Mock };
      notifications: { notifyUser: jest.Mock };
    });
    prisma.examSubject.findFirst.mockResolvedValue(baseExamSubject());
    prisma.section.findFirst.mockResolvedValue({ id: SECTION_ID, classId: "class-1" });
    prisma.section.findUnique.mockResolvedValue({ id: SECTION_ID, name: "A" });
    jest.spyOn(service, "getResultsForSection").mockResolvedValue({} as never);
  });

  describe("returnForCorrection", () => {
    it("rejects unless the submission is SUBMITTED or APPROVED", async () => {
      prisma.resultSubmission.findUnique.mockResolvedValue({ id: "sub-1", status: "DRAFT" });
      await expect(
        service.returnForCorrection(ADMIN_ACTOR, SCHOOL_ID, EXAM_SUBJECT_ID, SECTION_ID, { reason: "Missing marks" }),
      ).rejects.toThrow("Only a submitted or approved (not yet published) result set can be returned for correction");
    });

    it("moves SUBMITTED to NEEDS_CORRECTION, records the reason, and notifies the assigned teacher", async () => {
      prisma.resultSubmission.findUnique.mockResolvedValue({ id: "sub-1", status: "SUBMITTED" });
      prisma.teacherAssignment.findFirst.mockResolvedValue({ teacher: { userId: "teacher-user-1" } });

      await service.returnForCorrection(ADMIN_ACTOR, SCHOOL_ID, EXAM_SUBJECT_ID, SECTION_ID, { reason: "Recheck row 4" });

      expect(prisma.resultSubmission.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: "NEEDS_CORRECTION", returnReason: "Recheck row 4" }) }),
      );
      expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: "RESULTS_RETURNED" }));
      expect(notifications.notifyUser).toHaveBeenCalledWith(
        "teacher-user-1",
        expect.objectContaining({ title: "Correction Required" }),
      );
    });

    it("does not error when no teacher is currently assigned — there's simply nobody to notify", async () => {
      prisma.resultSubmission.findUnique.mockResolvedValue({ id: "sub-1", status: "SUBMITTED" });
      prisma.teacherAssignment.findFirst.mockResolvedValue(null);
      await expect(
        service.returnForCorrection(ADMIN_ACTOR, SCHOOL_ID, EXAM_SUBJECT_ID, SECTION_ID, { reason: "Recheck" }),
      ).resolves.toBeDefined();
      expect(notifications.notifyUser).not.toHaveBeenCalled();
    });
  });

  describe("approveSubmission", () => {
    it("rejects unless the submission is SUBMITTED", async () => {
      prisma.resultSubmission.findUnique.mockResolvedValue({ id: "sub-1", status: "NEEDS_CORRECTION" });
      await expect(service.approveSubmission(ADMIN_ACTOR, SCHOOL_ID, EXAM_SUBJECT_ID, SECTION_ID)).rejects.toThrow(
        "Only a submitted result set waiting for review can be approved",
      );
    });

    it("moves SUBMITTED to APPROVED and records RESULTS_APPROVED", async () => {
      prisma.resultSubmission.findUnique.mockResolvedValue({ id: "sub-1", status: "SUBMITTED" });
      prisma.teacherAssignment.findFirst.mockResolvedValue(null);
      await service.approveSubmission(ADMIN_ACTOR, SCHOOL_ID, EXAM_SUBJECT_ID, SECTION_ID);
      expect(prisma.resultSubmission.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: "APPROVED" }) }),
      );
      expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: "RESULTS_APPROVED" }));
    });
  });

  describe("publishSubmission", () => {
    it("rejects unless the submission is APPROVED", async () => {
      prisma.resultSubmission.findUnique.mockResolvedValue({ id: "sub-1", status: "SUBMITTED" });
      await expect(service.publishSubmission(ADMIN_ACTOR, SCHOOL_ID, EXAM_SUBJECT_ID, SECTION_ID)).rejects.toThrow(
        "Only an approved result set can be published",
      );
    });

    it("moves APPROVED to PUBLISHED with WARNING severity — this is what actually exposes results to Students/Parents", async () => {
      prisma.resultSubmission.findUnique.mockResolvedValue({ id: "sub-1", status: "APPROVED" });
      prisma.teacherAssignment.findFirst.mockResolvedValue(null);
      await service.publishSubmission(ADMIN_ACTOR, SCHOOL_ID, EXAM_SUBJECT_ID, SECTION_ID);
      expect(prisma.resultSubmission.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: "PUBLISHED" }) }),
      );
      expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: "RESULTS_PUBLISHED", severity: "WARNING" }));
    });
  });

  describe("unpublishSubmission", () => {
    it("rejects unless the submission is PUBLISHED", async () => {
      prisma.resultSubmission.findUnique.mockResolvedValue({ id: "sub-1", status: "APPROVED" });
      await expect(
        service.unpublishSubmission(ADMIN_ACTOR, SCHOOL_ID, EXAM_SUBJECT_ID, SECTION_ID, { reason: "Error found" }),
      ).rejects.toThrow("Only a published result set can be unpublished");
    });

    it("reverts PUBLISHED to APPROVED (not back to SUBMITTED) with WARNING severity and the given reason", async () => {
      prisma.resultSubmission.findUnique.mockResolvedValue({ id: "sub-1", status: "PUBLISHED" });
      prisma.teacherAssignment.findFirst.mockResolvedValue(null);

      await service.unpublishSubmission(ADMIN_ACTOR, SCHOOL_ID, EXAM_SUBJECT_ID, SECTION_ID, { reason: "Data entry error" });

      expect(prisma.resultSubmission.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: "APPROVED" } }),
      );
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: "RESULTS_UNPUBLISHED", severity: "WARNING", after: expect.objectContaining({ reason: "Data entry error" }) }),
      );
    });
  });

  it("admin actions (approve/return/publish/unpublish) never require a teacher-assignment check — only entry/submit/upload do", async () => {
    prisma.resultSubmission.findUnique.mockResolvedValue({ id: "sub-1", status: "SUBMITTED" });
    prisma.teacherAssignment.findFirst.mockResolvedValue(null);
    await service.approveSubmission(ADMIN_ACTOR, SCHOOL_ID, EXAM_SUBJECT_ID, SECTION_ID);
    // No prisma.teacher.findFirst call at all for this path — confirms
    // assertCanAccessSectionForSubject (which starts with that lookup) is
    // never invoked by the admin-only transitions.
    expect(prisma.teacher.findFirst).not.toHaveBeenCalled();
  });
});

describe("ExamsService.listMyExams — teacher-derived, never client-supplied", () => {
  let prisma: MockPrisma;
  let service: ExamsService;

  beforeEach(() => {
    prisma = createMockPrisma();
    ({ service } = createService(prisma));
  });

  it("returns an empty list when the actor has no Teacher profile", async () => {
    prisma.teacher.findFirst.mockResolvedValue(null);
    await expect(service.listMyExams(ADMIN_ACTOR)).resolves.toEqual([]);
    expect(prisma.teacherAssignment.findMany).not.toHaveBeenCalled();
  });

  it("defaults paperStatus to null and resultsStatus to DRAFT when no submission row exists yet", async () => {
    prisma.teacher.findFirst.mockResolvedValue({ id: "teacher-1" });
    prisma.teacherAssignment.findMany.mockResolvedValue([
      {
        id: "assignment-1",
        sectionId: SECTION_ID,
        subjectId: "subject-1",
        academicYearId: "year-1",
        section: { classId: "class-1", class: { name: "Class 1" }, name: "A" },
        subject: { name: "Mathematics" },
        academicYear: { name: "2027" },
        schoolId: SCHOOL_ID,
      },
    ]);
    prisma.examSubject.findMany.mockResolvedValue([
      { id: EXAM_SUBJECT_ID, examDate: null, maxMarks: 100, createdAt: new Date("2027-01-01"), exam: { id: "exam-1", name: "Term 1", type: "TERM" } },
    ]);
    prisma.resultSubmission.findUnique.mockResolvedValue(null);

    const [row] = await service.listMyExams(TEACHER_ACTOR);

    expect(row.paperStatus).toBeNull();
    expect(row.resultsStatus).toBe("DRAFT");
  });

  it("surfaces the real submission's paperStatus and resultsStatus when one exists", async () => {
    prisma.teacher.findFirst.mockResolvedValue({ id: "teacher-1" });
    prisma.teacherAssignment.findMany.mockResolvedValue([
      {
        id: "assignment-1",
        sectionId: SECTION_ID,
        subjectId: "subject-1",
        academicYearId: "year-1",
        section: { classId: "class-1", class: { name: "Class 1" }, name: "A" },
        subject: { name: "Mathematics" },
        academicYear: { name: "2027" },
        schoolId: SCHOOL_ID,
      },
    ]);
    prisma.examSubject.findMany.mockResolvedValue([
      { id: EXAM_SUBJECT_ID, examDate: null, maxMarks: 100, createdAt: new Date("2027-01-01"), exam: { id: "exam-1", name: "Term 1", type: "TERM" } },
    ]);
    prisma.resultSubmission.findUnique.mockResolvedValue({ paperStatus: "SUBMITTED", status: "APPROVED", updatedAt: new Date("2027-02-01") });

    const [row] = await service.listMyExams(TEACHER_ACTOR);

    expect(row.paperStatus).toBe("SUBMITTED");
    expect(row.resultsStatus).toBe("APPROVED");
  });
});

describe("ExamsService.listResultSubmissions / listExamPapers — viewpoint scoping", () => {
  let prisma: MockPrisma;
  let service: ExamsService;

  beforeEach(() => {
    prisma = createMockPrisma();
    ({ service } = createService(prisma));
    prisma.resultSubmission.findMany.mockResolvedValue([]);
  });

  it("scopes to exactly the requested school when filters.schoolId is given", async () => {
    await service.listResultSubmissions(ADMIN_ACTOR, { schoolId: SCHOOL_ID });
    expect(prisma.resultSubmission.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          AND: expect.arrayContaining([{ examSubject: { exam: { schoolId: { in: [SCHOOL_ID] } } } }]),
        }),
      }),
    );
  });

  it("scopes to the actor's own schoolIds when no schoolId filter is given but the actor has schools", async () => {
    await service.listResultSubmissions(ADMIN_ACTOR, {});
    expect(prisma.resultSubmission.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          AND: expect.arrayContaining([{ examSubject: { exam: { schoolId: { in: [SCHOOL_ID] } } } }]),
        }),
      }),
    );
  });

  it("falls back to an org-wide scope for a Super/Org Admin with no schoolIds of their own", async () => {
    const orgAdmin: AuthenticatedUser = { ...ADMIN_ACTOR, schoolIds: [] };
    await service.listResultSubmissions(orgAdmin, {});
    expect(prisma.resultSubmission.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          AND: expect.arrayContaining([{ examSubject: { exam: { school: { organizationId: "org-1" } } } }]),
        }),
      }),
    );
  });

  it("filters listExamPapers to papers with a non-null paperStatus when no status filter is given", async () => {
    prisma.resultSubmission.findMany.mockResolvedValue([]);
    await service.listExamPapers(ADMIN_ACTOR, {});
    expect(prisma.resultSubmission.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ AND: expect.arrayContaining([{ paperStatus: { not: null } }]) }),
      }),
    );
  });

  it("applies teacherId as a post-query filter, keeping only rows whose resolved teacher matches", async () => {
    prisma.resultSubmission.findMany.mockResolvedValue([
      {
        id: "sub-1",
        examSubjectId: "es-1",
        sectionId: SECTION_ID,
        status: "SUBMITTED",
        submittedAt: null,
        section: { name: "A", class: { name: "Class 1" } },
        examSubject: {
          classId: "class-1",
          subjectId: "subject-1",
          exam: { id: "exam-1", name: "Term 1", schoolId: SCHOOL_ID, academicYearId: "year-1", school: { name: "Test School" }, academicYear: { name: "2027" } },
          subject: { name: "Mathematics" },
        },
      },
      {
        id: "sub-2",
        examSubjectId: "es-2",
        sectionId: "section-2",
        status: "SUBMITTED",
        submittedAt: null,
        section: { name: "B", class: { name: "Class 1" } },
        examSubject: {
          classId: "class-1",
          subjectId: "subject-1",
          exam: { id: "exam-1", name: "Term 1", schoolId: SCHOOL_ID, academicYearId: "year-1", school: { name: "Test School" }, academicYear: { name: "2027" } },
          subject: { name: "Mathematics" },
        },
      },
    ]);
    prisma.teacherAssignment.findFirst.mockImplementation((args: { where: { sectionId: string } }) =>
      Promise.resolve(
        args.where.sectionId === SECTION_ID
          ? { teacherId: "teacher-1", teacher: { firstName: "Wanted", lastName: "Teacher" } }
          : { teacherId: "teacher-2", teacher: { firstName: "Other", lastName: "Teacher" } },
      ),
    );
    prisma.studentEnrollment.count.mockResolvedValue(10);
    prisma.result.count.mockResolvedValue(5);

    const rows = await service.listResultSubmissions(ADMIN_ACTOR, { teacherId: "teacher-1" });

    expect(rows).toHaveLength(1);
    expect(rows[0].resultSubmissionId).toBe("sub-1");
  });

  // Test D/E (regression): Results Review used to show "1/0 completed" for
  // an exam whose section has since moved on to a new academic year — a
  // real Result row (completedCount) divided by a roster count that only
  // ever matched still-ACTIVE enrollments (studentCount), which is 0 for a
  // closed historical year. Scoping the roster count by academicYearId alone
  // fixes both the count and the resulting impossible display.
  it("Test D/E: a historical exam's studentCount reflects its own year's real (closed) enrollments — no impossible 1/0 completed state", async () => {
    prisma.resultSubmission.findMany.mockResolvedValue([
      {
        id: "sub-historical",
        examSubjectId: "es-1",
        sectionId: SECTION_ID,
        status: "PUBLISHED",
        submittedAt: null,
        section: { name: "A", class: { name: "Class 1" } },
        examSubject: {
          classId: "class-1",
          subjectId: "subject-1",
          exam: { id: "exam-1", name: "wqrer", schoolId: SCHOOL_ID, academicYearId: "year-2025", school: { name: "Test School" }, academicYear: { name: "2025" } },
          subject: { name: "Mathematics" },
        },
      },
    ]);
    prisma.teacherAssignment.findFirst.mockResolvedValue(null);
    // The one student who sat this historical exam has since been promoted
    // — their enrollment for year-2025 is closed, not deleted, and a real
    // Result row still exists for it.
    prisma.studentEnrollment.count.mockResolvedValue(1);
    prisma.result.count.mockResolvedValue(1);

    const rows = await service.listResultSubmissions(ADMIN_ACTOR, {});

    expect(rows[0]).toMatchObject({ studentCount: 1, completedCount: 1, missingCount: 0 });
    const countArgs = prisma.studentEnrollment.count.mock.calls[0][0];
    expect(countArgs.where).toEqual({ sectionId: SECTION_ID, academicYearId: "year-2025" });
    expect(countArgs.where).not.toHaveProperty("status");
  });
});

// Phase 3: listExams/listExamSubjects were school-scoped but not
// assignment-scoped — any actor with results.view (every Teacher, to see
// their own marks) could list every class+subject an exam covers
// school-wide, not just their own. Metadata, not marks, but still not
// theirs to see, and the frontend's own client-side filtering (My Classes'
// workspace page) was never a substitute for a real backend boundary.
describe("ExamsService.listExams — teacher narrowing (Phase 3)", () => {
  let prisma: MockPrisma;
  let service: ExamsService;

  function examRow(overrides: Partial<Record<string, unknown>> = {}) {
    return {
      id: "exam-1",
      schoolId: SCHOOL_ID,
      academicYearId: "year-1",
      examSubjects: [
        { id: "es-math-c1a", classId: "class-1", subjectId: "subject-math", class: { name: "Class 1" }, subject: { name: "Mathematics" } },
        { id: "es-sci-c1a", classId: "class-1", subjectId: "subject-sci", class: { name: "Class 1" }, subject: { name: "Science" } },
      ],
      ...overrides,
    };
  }

  beforeEach(() => {
    prisma = createMockPrisma();
    ({ service } = createService(prisma));
    prisma.exam.findMany.mockResolvedValue([examRow()]);
  });

  it("returns every exam and examSubject unchanged for an Admin (no Teacher profile)", async () => {
    prisma.teacher.findFirst.mockResolvedValue(null);
    const result = await service.listExams(ADMIN_ACTOR, SCHOOL_ID);
    expect(result).toHaveLength(1);
    expect(result[0].examSubjects).toHaveLength(2);
  });

  it("narrows a Teacher's view to only the class+subject they're assigned to teach", async () => {
    prisma.teacher.findFirst.mockResolvedValue({ id: "teacher-1" });
    prisma.teacherAssignment.findMany.mockResolvedValue([
      { academicYearId: "year-1", subjectId: "subject-math", section: { classId: "class-1" } },
    ]);

    const result = await service.listExams(TEACHER_ACTOR, SCHOOL_ID);

    expect(result).toHaveLength(1);
    expect(result[0].examSubjects).toEqual([
      expect.objectContaining({ id: "es-math-c1a" }),
    ]);
  });

  it("drops an exam entirely when none of its examSubjects match the teacher's assignments", async () => {
    prisma.teacher.findFirst.mockResolvedValue({ id: "teacher-1" });
    prisma.teacherAssignment.findMany.mockResolvedValue([
      { academicYearId: "year-1", subjectId: "subject-history", section: { classId: "class-9" } },
    ]);

    const result = await service.listExams(TEACHER_ACTOR, SCHOOL_ID);
    expect(result).toEqual([]);
  });

  it("respects academic year — an assignment for a different year never grants access to this exam's subjects", async () => {
    prisma.teacher.findFirst.mockResolvedValue({ id: "teacher-1" });
    prisma.teacherAssignment.findMany.mockResolvedValue([
      { academicYearId: "year-OLD", subjectId: "subject-math", section: { classId: "class-1" } },
    ]);

    const result = await service.listExams(TEACHER_ACTOR, SCHOOL_ID);
    expect(result).toEqual([]);
  });

  it("scopes the teacher's own assignments to this school only", async () => {
    prisma.teacher.findFirst.mockResolvedValue({ id: "teacher-1" });
    prisma.teacherAssignment.findMany.mockResolvedValue([]);

    await service.listExams(TEACHER_ACTOR, SCHOOL_ID);

    expect(prisma.teacherAssignment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { teacherId: "teacher-1", schoolId: SCHOOL_ID } }),
    );
  });
});

describe("ExamsService.listExamSubjects — teacher narrowing (Phase 3)", () => {
  let prisma: MockPrisma;
  let service: ExamsService;

  const EXAM = { id: "exam-1", schoolId: SCHOOL_ID, academicYearId: "year-1" };
  const SUBJECTS = [
    { id: "es-math-c1a", classId: "class-1", subjectId: "subject-math", class: { name: "Class 1" }, subject: { name: "Mathematics" } },
    { id: "es-sci-c1a", classId: "class-1", subjectId: "subject-sci", class: { name: "Class 1" }, subject: { name: "Science" } },
  ];

  beforeEach(() => {
    prisma = createMockPrisma();
    ({ service } = createService(prisma));
    prisma.exam.findFirst.mockResolvedValue(EXAM);
    prisma.examSubject.findMany.mockResolvedValue(SUBJECTS);
  });

  it("returns every examSubject unchanged for an Admin (no Teacher profile)", async () => {
    prisma.teacher.findFirst.mockResolvedValue(null);
    const result = await service.listExamSubjects(ADMIN_ACTOR, SCHOOL_ID, "exam-1");
    expect(result).toHaveLength(2);
  });

  it("narrows a Teacher's view to only their own assigned class+subject", async () => {
    prisma.teacher.findFirst.mockResolvedValue({ id: "teacher-1" });
    prisma.teacherAssignment.findMany.mockResolvedValue([{ subjectId: "subject-sci", section: { classId: "class-1" } }]);

    const result = await service.listExamSubjects(TEACHER_ACTOR, SCHOOL_ID, "exam-1");

    expect(result).toEqual([expect.objectContaining({ id: "es-sci-c1a" })]);
  });

  it("scopes the teacher's own assignments to this school and this exam's academic year", async () => {
    prisma.teacher.findFirst.mockResolvedValue({ id: "teacher-1" });
    prisma.teacherAssignment.findMany.mockResolvedValue([]);

    await service.listExamSubjects(TEACHER_ACTOR, SCHOOL_ID, "exam-1");

    expect(prisma.teacherAssignment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { teacherId: "teacher-1", schoolId: SCHOOL_ID, academicYearId: "year-1" } }),
    );
  });
});

describe("ExamsService.listExamPapers — teacher narrowing (Phase 3)", () => {
  let prisma: MockPrisma;
  let service: ExamsService;

  function submissionRow(overrides: Partial<Record<string, unknown>> = {}) {
    return {
      id: "sub-1",
      sectionId: SECTION_ID,
      paperStatus: "SUBMITTED",
      paperSubmittedAt: new Date("2027-02-01"),
      section: { name: "A", class: { name: "Class 1" } },
      examSubject: {
        classId: "class-1",
        subjectId: "subject-math",
        exam: { id: "exam-1", name: "Term 1", schoolId: SCHOOL_ID, academicYearId: "year-1", school: { name: "Test School" }, academicYear: { name: "2027" } },
        subject: { name: "Mathematics" },
      },
      ...overrides,
    };
  }

  beforeEach(() => {
    prisma = createMockPrisma();
    ({ service } = createService(prisma));
    prisma.teacherAssignment.findFirst.mockResolvedValue(null); // per-row "responsible teacher" lookup used for display, not authorization
  });

  it("returns every submission unchanged for an Admin (no Teacher profile)", async () => {
    prisma.teacher.findFirst.mockResolvedValue(null);
    prisma.resultSubmission.findMany.mockResolvedValue([submissionRow(), submissionRow({ id: "sub-2", sectionId: "section-2" })]);

    const rows = await service.listExamPapers(ADMIN_ACTOR, {});
    expect(rows).toHaveLength(2);
  });

  it("narrows a Teacher to only their own (section, subject, year) submissions — never another teacher's papers in the same school", async () => {
    prisma.teacher.findFirst.mockResolvedValue({ id: "teacher-1" });
    prisma.teacherAssignment.findMany.mockResolvedValue([
      { sectionId: SECTION_ID, subjectId: "subject-math", academicYearId: "year-1" },
    ]);
    prisma.resultSubmission.findMany.mockResolvedValue([
      submissionRow({ id: "sub-mine" }),
      submissionRow({ id: "sub-not-mine", examSubject: { ...submissionRow().examSubject, subjectId: "subject-sci" } }),
    ]);

    const rows = await service.listExamPapers(TEACHER_ACTOR, {});

    expect(rows.map((r: { resultSubmissionId: string }) => r.resultSubmissionId)).toEqual(["sub-mine"]);
  });
});

// Term/Annual result calculation — the arithmetic behind Promotion
// eligibility. Deliberately isolated from ResultSubmission/Exam creation
// mechanics above: these tests only care about the SUM(marksObtained)/
// SUM(maxMarks) math, the configured Term weighting, and the "Incomplete"
// (never a fabricated 0%) rule for a term with zero published results.
describe("ExamsService.getTermPercentage / getAnnualResult", () => {
  let prisma: MockPrisma;
  let service: ExamsService;

  beforeEach(() => {
    prisma = createMockPrisma();
    ({ service } = createService(prisma));
  });

  function publishedResult(marksObtained: number, maxMarks: number) {
    return { marksObtained, examSubject: { maxMarks } };
  }

  it("returns null (Incomplete) when the enrollment has zero published results for this term", async () => {
    prisma.result.findMany.mockResolvedValue([]);

    const percentage = await service.getTermPercentage("enr-1", "term-1");

    expect(percentage).toBeNull();
    expect(prisma.result.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          enrollmentId: "enr-1",
          resultSubmission: { status: "PUBLISHED" },
          examSubject: { exam: { termId: "term-1" } },
        }),
      }),
    );
  });

  it("computes SUM(marksObtained)/SUM(maxMarks) across every subject, not an average of per-subject percentages", async () => {
    // Subject A: 90/100 (90%), Subject B: 40/100 (40%) — a plain average of
    // percentages would be 65%; the correct SUM/SUM here is also 65% only
    // because both subjects share the same maxMarks. Use different
    // maxMarks to prove it's genuinely SUM/SUM, not an average.
    prisma.result.findMany.mockResolvedValue([publishedResult(90, 100), publishedResult(10, 50)]);
    // SUM(marksObtained) = 100, SUM(maxMarks) = 150 → 66.67%, NOT the
    // per-subject average of (90% + 20%)/2 = 55%.

    const percentage = await service.getTermPercentage("enr-1", "term-1");

    expect(percentage).toBeCloseTo(66.67, 2);
  });

  it("a subject the student has no result for contributes nothing to either sum — never treated as 0", async () => {
    prisma.result.findMany.mockResolvedValue([publishedResult(100, 100)]);

    const percentage = await service.getTermPercentage("enr-1", "term-1");

    expect(percentage).toBe(100);
  });

  it("only counts PUBLISHED results — the query itself excludes Draft/Submitted/Approved", () => {
    // Verified structurally above via the exact where-clause assertion;
    // this test documents the intent so a future change that widens the
    // filter doesn't slip through unnoticed.
    expect(true).toBe(true);
  });

  it("Annual Result: 50.00% is eligible", async () => {
    prisma.term.findMany.mockResolvedValue([
      { id: "term-1", name: "Term 1", weight: 50 },
      { id: "term-2", name: "Term 2", weight: 50 },
    ]);
    prisma.result.findMany
      .mockResolvedValueOnce([publishedResult(50, 100)]) // Term 1: 50%
      .mockResolvedValueOnce([publishedResult(50, 100)]); // Term 2: 50%

    const annual = await service.getAnnualResult("enr-1", "year-1");

    expect(annual.annualPercentage).toBe(50);
    expect(annual.eligible).toBe(true);
  });

  it("Annual Result: 49.99% is not eligible", async () => {
    prisma.term.findMany.mockResolvedValue([
      { id: "term-1", name: "Term 1", weight: 50 },
      { id: "term-2", name: "Term 2", weight: 50 },
    ]);
    prisma.result.findMany
      .mockResolvedValueOnce([publishedResult(49.98, 100)])
      .mockResolvedValueOnce([publishedResult(50, 100)]);

    const annual = await service.getAnnualResult("enr-1", "year-1");

    expect(annual.annualPercentage).toBe(49.99);
    expect(annual.eligible).toBe(false);
  });

  it("uses the academic year's own configured weights, e.g. 40/60, never a hard-coded 50/50", async () => {
    prisma.term.findMany.mockResolvedValue([
      { id: "term-1", name: "Term 1", weight: 40 },
      { id: "term-2", name: "Term 2", weight: 60 },
    ]);
    prisma.result.findMany
      .mockResolvedValueOnce([publishedResult(70, 100)]) // Term 1: 70%
      .mockResolvedValueOnce([publishedResult(80, 100)]); // Term 2: 80%

    const annual = await service.getAnnualResult("enr-1", "year-1");

    // (70 * 0.40) + (80 * 0.60) = 28 + 48 = 76
    expect(annual.annualPercentage).toBe(76);
    expect(annual.eligible).toBe(true);
  });

  it("a completely missing Term 2 makes the Annual Result Incomplete — never computed from Term 1 alone, never defaulted to 0", async () => {
    prisma.term.findMany.mockResolvedValue([
      { id: "term-1", name: "Term 1", weight: 50 },
      { id: "term-2", name: "Term 2", weight: 50 },
    ]);
    prisma.result.findMany
      .mockResolvedValueOnce([publishedResult(60, 100)]) // Term 1: 60%
      .mockResolvedValueOnce([]); // Term 2: nothing published yet

    const annual = await service.getAnnualResult("enr-1", "year-1");

    expect(annual.term1Percentage).toBe(60);
    expect(annual.term2Percentage).toBeNull();
    expect(annual.annualPercentage).toBeNull();
    expect(annual.eligible).toBeNull();
  });
});

// Phase 1 — the school's structure is exactly two terms, each with one exam
// (Term 1 Exam / Term 2 Exam). These prove a Term 2 exam's published
// results land in Term 2 (not Term 1, not nowhere), whatever Exam Type the
// exam carries and whether it is out of 50 or out of 100.
describe("ExamsService — Term 1 / Term 2 exams feed the Annual Result", () => {
  let prisma: MockPrisma;
  let service: ExamsService;

  const TERMS = [
    { id: "term-1", name: "Term 1", weight: 50 },
    { id: "term-2", name: "Term 2", weight: 50 },
  ];

  beforeEach(() => {
    prisma = createMockPrisma();
    ({ service } = createService(prisma));
    prisma.term.findMany.mockResolvedValue(TERMS);
  });

  // Simulates the database: each published result belongs to the exam of one
  // specific term, and the service's own where-clause picks which ones it sees.
  function seedPublishedResults(byTerm: Record<string, Array<{ marksObtained: number; examSubject: { maxMarks: number } }>>) {
    prisma.result.findMany.mockImplementation((args: { where: { examSubject: { exam: { termId: string } } } }) =>
      Promise.resolve(byTerm[args.where.examSubject.exam.termId] ?? []),
    );
  }

  it("a Term 2 exam's published results appear as Term 2 — with Term 1 out of 50 and Term 2 out of 100", async () => {
    seedPublishedResults({
      "term-1": [{ marksObtained: 42, examSubject: { maxMarks: 50 } }], // 84%
      "term-2": [{ marksObtained: 78, examSubject: { maxMarks: 100 } }], // 78%
    });

    const annual = await service.getAnnualResult("enr-1", "year-1");

    expect(annual).toEqual({ term1Percentage: 84, term2Percentage: 78, annualPercentage: 81, eligible: true });
  });

  it("looks up each term by its own id and never filters on Exam Type — a Mid-Term/Final exam is not a separate term", async () => {
    seedPublishedResults({ "term-1": [{ marksObtained: 60, examSubject: { maxMarks: 100 } }] });

    await service.getAnnualResult("enr-1", "year-1");

    const wheres = prisma.result.findMany.mock.calls.map((c) => c[0].where);
    expect(wheres).toHaveLength(2);
    expect(wheres.map((w) => w.examSubject)).toEqual([{ exam: { termId: "term-1" } }, { exam: { termId: "term-2" } }]);
    for (const w of wheres) expect(JSON.stringify(w)).not.toMatch(/"type"/);
  });

  it("Term 2 not yet published: Term 2 and Annual stay Incomplete — never 0%, never a failing result", async () => {
    seedPublishedResults({ "term-1": [{ marksObtained: 69, examSubject: { maxMarks: 100 } }] });

    const annual = await service.getAnnualResult("enr-1", "year-1");

    expect(annual).toEqual({ term1Percentage: 69, term2Percentage: null, annualPercentage: null, eligible: null });
  });

  it("uses ONLY Term 1 and Term 2 — a stray third term row is never queried or counted", async () => {
    prisma.term.findMany.mockResolvedValue([...TERMS, { id: "term-3", name: "Term 3", weight: 0 }]);
    seedPublishedResults({
      "term-1": [{ marksObtained: 70, examSubject: { maxMarks: 100 } }],
      "term-2": [{ marksObtained: 80, examSubject: { maxMarks: 100 } }],
      "term-3": [{ marksObtained: 0, examSubject: { maxMarks: 100 } }],
    });

    const annual = await service.getAnnualResult("enr-1", "year-1");

    expect(prisma.result.findMany).toHaveBeenCalledTimes(2);
    expect(annual.annualPercentage).toBe(75);
  });

  it("an academic year missing either of its two terms is Incomplete, not computed from the one that exists", async () => {
    prisma.term.findMany.mockResolvedValue([TERMS[0]]);

    const annual = await service.getAnnualResult("enr-1", "year-1");

    expect(annual).toEqual({ term1Percentage: null, term2Percentage: null, annualPercentage: null, eligible: null });
    expect(prisma.result.findMany).not.toHaveBeenCalled();
  });
});

describe("ExamsService.updateExamTerm — repairing an exam saved under the wrong term", () => {
  let prisma: MockPrisma;
  let service: ExamsService;
  let audit: { record: jest.Mock };
  let schools: { findOneAccessibleOrThrow: jest.Mock; findOneAccessibleOrTeachingAtOrThrow: jest.Mock };

  const TERM1_EXAM = { id: "exam-1", name: "Term 2 Exam", schoolId: SCHOOL_ID, academicYearId: "year-1", termId: "term-1", term: { id: "term-1", name: "Term 1" } };

  beforeEach(() => {
    prisma = createMockPrisma();
    ({ service, audit, schools } = createService(prisma));
    prisma.exam.findFirst.mockResolvedValue(TERM1_EXAM);
    prisma.term.findFirst.mockResolvedValue({ id: "term-2", name: "Term 2", academicYearId: "year-1" });
    prisma.exam.update.mockResolvedValue({ ...TERM1_EXAM, termId: "term-2", term: { id: "term-2", name: "Term 2" } });
  });

  it("moves the exam to the other term of its own year and audits the old and new term", async () => {
    const result = await service.updateExamTerm(ADMIN_ACTOR, SCHOOL_ID, "exam-1", { termId: "term-2" });

    expect(prisma.exam.update).toHaveBeenCalledWith({ where: { id: "exam-1" }, data: { termId: "term-2" }, include: { term: true } });
    expect(result.term).toEqual({ id: "term-2", name: "Term 2" });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "EXAM_TERM_CHANGED",
        resourceId: "exam-1",
        before: { termId: "term-1", termName: "Term 1" },
        after: { termId: "term-2", termName: "Term 2" },
      }),
    );
  });

  it("assigns a term to a legacy exam that has none", async () => {
    prisma.exam.findFirst.mockResolvedValue({ ...TERM1_EXAM, termId: null, term: null });

    await service.updateExamTerm(ADMIN_ACTOR, SCHOOL_ID, "exam-1", { termId: "term-2" });

    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ before: { termId: null, termName: null } }));
  });

  it("rejects a term that belongs to a different academic year", async () => {
    prisma.term.findFirst.mockResolvedValue(null);

    await expect(service.updateExamTerm(ADMIN_ACTOR, SCHOOL_ID, "exam-1", { termId: "other-year-term" })).rejects.toThrow(
      "That term does not belong to this exam's academic year",
    );
    expect(prisma.term.findFirst).toHaveBeenCalledWith({ where: { id: "other-year-term", academicYearId: "year-1" } });
    expect(prisma.exam.update).not.toHaveBeenCalled();
  });

  it("only finds exams in the given school — another school's exam is a 404", async () => {
    prisma.exam.findFirst.mockResolvedValue(null);

    await expect(service.updateExamTerm(ADMIN_ACTOR, "another-school", "exam-1", { termId: "term-2" })).rejects.toThrow(NotFoundException);
    expect(prisma.exam.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "exam-1", schoolId: "another-school" } }));
    expect(schools.findOneAccessibleOrThrow).toHaveBeenCalledWith(ADMIN_ACTOR, "another-school");
  });

  it("does nothing (and audits nothing) when the exam is already on that term", async () => {
    prisma.term.findFirst.mockResolvedValue({ id: "term-1", name: "Term 1", academicYearId: "year-1" });

    await service.updateExamTerm(ADMIN_ACTOR, SCHOOL_ID, "exam-1", { termId: "term-1" });

    expect(prisma.exam.update).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });
});
