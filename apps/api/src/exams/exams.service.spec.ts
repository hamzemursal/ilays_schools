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
  exam: { findMany: jest.Mock; findFirst: jest.Mock; findUniqueOrThrow: jest.Mock };
  examSubject: { findFirst: jest.Mock; findMany: jest.Mock; create: jest.Mock; update: jest.Mock; createMany: jest.Mock };
  classSubject: { findMany: jest.Mock };
  class: { findFirst: jest.Mock };
  subject: { findFirst: jest.Mock };
  academicYear: { findFirst: jest.Mock };
  section: { findFirst: jest.Mock; findUnique: jest.Mock };
  studentEnrollment: { findMany: jest.Mock; count: jest.Mock };
  resultSubmission: { findUnique: jest.Mock; upsert: jest.Mock; update: jest.Mock; findMany: jest.Mock };
  result: { upsert: jest.Mock; count: jest.Mock };
  teacher: { findFirst: jest.Mock };
  teacherAssignment: { findFirst: jest.Mock; findMany: jest.Mock };
  $transaction: jest.Mock;
};

function createMockPrisma(): MockPrisma {
  return {
    exam: { findMany: jest.fn(), findFirst: jest.fn(), findUniqueOrThrow: jest.fn() },
    examSubject: { findFirst: jest.fn(), findMany: jest.fn(), create: jest.fn(), update: jest.fn(), createMany: jest.fn() },
    classSubject: { findMany: jest.fn() },
    class: { findFirst: jest.fn() },
    subject: { findFirst: jest.fn() },
    academicYear: { findFirst: jest.fn() },
    section: { findFirst: jest.fn(), findUnique: jest.fn() },
    studentEnrollment: { findMany: jest.fn(), count: jest.fn() },
    resultSubmission: { findUnique: jest.fn(), upsert: jest.fn(), update: jest.fn(), findMany: jest.fn() },
    result: { upsert: jest.fn(), count: jest.fn() },
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
  const schools = { findOneAccessibleOrThrow: jest.fn().mockResolvedValue(undefined) };
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
  });

  function dto(examSubjects: CreateExamDto["examSubjects"]): CreateExamDto {
    return { academicYearId: "year-1", name: "Term 1 Exam", type: "TERM" as CreateExamDto["type"], examSubjects };
  }

  it("rejects when the academic year does not belong to this school", async () => {
    prisma.academicYear.findFirst.mockResolvedValue(null);
    await expect(service.createExam(ADMIN_ACTOR, SCHOOL_ID, dto([]))).rejects.toThrow(
      "That academic year does not belong to this school",
    );
  });

  it("deduplicates repeated (classId, subjectId) pairs before validating them", async () => {
    prisma.classSubject.findMany.mockResolvedValue([{ classId: "class-1", subjectId: "subject-1" }]);
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
    prisma.exam.findFirst.mockResolvedValue({ id: "exam-1", schoolId: SCHOOL_ID });
  });

  const dto: CreateExamSubjectDto = { classId: "class-1", subjectId: "subject-1" };

  it("rejects a class that does not belong to this school", async () => {
    prisma.class.findFirst.mockResolvedValue(null);
    await expect(service.createExamSubject(ADMIN_ACTOR, SCHOOL_ID, "exam-1", dto)).rejects.toThrow(
      "That class does not belong to this school",
    );
  });

  it("rejects a subject that does not belong to this school", async () => {
    prisma.class.findFirst.mockResolvedValue({ id: "class-1" });
    prisma.subject.findFirst.mockResolvedValue(null);
    await expect(service.createExamSubject(ADMIN_ACTOR, SCHOOL_ID, "exam-1", dto)).rejects.toThrow(
      "That subject does not belong to this school",
    );
  });

  it("translates a P2002 violation into a ConflictException naming the real cause", async () => {
    prisma.class.findFirst.mockResolvedValue({ id: "class-1" });
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
    prisma.studentEnrollment.findMany.mockResolvedValue([{ id: "e1" }]);
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
    ).rejects.toThrow(`Marks for enrollment e1 exceed the max of 100`);
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
        update: { marksObtained: 77, enteredByUserId: ADMIN_ACTOR.id },
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
    it("rejects unless the submission is SUBMITTED", async () => {
      prisma.resultSubmission.findUnique.mockResolvedValue({ id: "sub-1", status: "DRAFT" });
      await expect(
        service.returnForCorrection(ADMIN_ACTOR, SCHOOL_ID, EXAM_SUBJECT_ID, SECTION_ID, { reason: "Missing marks" }),
      ).rejects.toThrow("Only a submitted result set waiting for review can be returned");
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
