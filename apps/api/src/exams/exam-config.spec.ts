import "reflect-metadata";
import * as fs from "node:fs";
import * as path from "node:path";
import { BadRequestException } from "@nestjs/common";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import type { AuthenticatedUser } from "../auth/types/authenticated-user";
import { PERMISSIONS_KEY } from "../auth/decorators/require-permissions.decorator";
import type { PrismaService } from "../prisma/prisma.service";
import type { SchoolsService } from "../schools/schools.service";
import type { AuditService } from "../audit/audit.service";
import type { DocumentsService } from "../documents/documents.service";
import type { NotificationsService } from "../notifications/notifications.service";
import { ExamsController } from "./exams.controller";
import { ExamsService } from "./exams.service";
import { CreateExamDto } from "./dto/create-exam.dto";
import { CreateExamSubjectDto } from "./dto/create-exam-subject.dto";
import { UpdateExamSubjectDto } from "./dto/update-exam-subject.dto";
import { EnterMarksDto } from "./dto/enter-marks.dto";

// Admin-controlled exam mark configuration: Maximum Marks and Pass Mark are
// set (and changed) only by an Admin, are validated, and a Teacher can only
// enter marks inside them.

const UUID = "3f1c2a4e-1d1b-4d2e-9a53-0a6f1e7a9c11";
const SCHOOL_ID = "school-1";
const EXAM_SUBJECT_ID = "examsubject-1";

const ADMIN: AuthenticatedUser = {
  id: "admin-1",
  email: "admin@example.com",
  organizationId: "org-1",
  roles: ["SCHOOL_ADMIN"],
  permissions: ["results.approve", "results.enter", "results.view"],
  schoolIds: [SCHOOL_ID],
};

type MockPrisma = {
  academicYear: { findFirst: jest.Mock };
  term: { findFirst: jest.Mock };
  classSubject: { findMany: jest.Mock };
  class: { findFirst: jest.Mock };
  subject: { findFirst: jest.Mock };
  exam: { findFirst: jest.Mock; create: jest.Mock; findUniqueOrThrow: jest.Mock };
  examSubject: { findFirst: jest.Mock; create: jest.Mock; update: jest.Mock; createMany: jest.Mock };
  resultSubmission: { count: jest.Mock };
  result: { aggregate: jest.Mock };
  $transaction: jest.Mock;
};

function setup() {
  const prisma: MockPrisma = {
    academicYear: { findFirst: jest.fn().mockResolvedValue({ id: "year-1" }) },
    term: { findFirst: jest.fn().mockResolvedValue({ id: "term-1" }) },
    classSubject: { findMany: jest.fn().mockResolvedValue([]) },
    class: { findFirst: jest.fn().mockResolvedValue({ id: "class-1" }) },
    subject: { findFirst: jest.fn().mockResolvedValue({ id: "subject-1" }) },
    exam: { findFirst: jest.fn().mockResolvedValue({ id: "exam-1", schoolId: SCHOOL_ID }), create: jest.fn(), findUniqueOrThrow: jest.fn() },
    examSubject: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn(), createMany: jest.fn() },
    resultSubmission: { count: jest.fn().mockResolvedValue(0) },
    result: { aggregate: jest.fn().mockResolvedValue({ _max: { marksObtained: null } }) },
    $transaction: jest.fn(),
  };
  prisma.$transaction.mockImplementation((fn: (tx: unknown) => unknown) => fn(prisma));
  prisma.exam.create.mockResolvedValue({ id: "exam-1" });
  prisma.exam.findUniqueOrThrow.mockResolvedValue({ id: "exam-1", examSubjects: [] });
  prisma.examSubject.create.mockResolvedValue({ id: EXAM_SUBJECT_ID });
  prisma.examSubject.update.mockResolvedValue({ id: EXAM_SUBJECT_ID });

  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  const schools = { findOneAccessibleOrThrow: jest.fn().mockResolvedValue({ id: SCHOOL_ID }) };
  const service = new ExamsService(
    prisma as unknown as PrismaService,
    schools as unknown as SchoolsService,
    audit as unknown as AuditService,
    {} as unknown as DocumentsService,
    {} as unknown as NotificationsService,
  );
  return { prisma, audit, service };
}

const createExamDto = (extra: Partial<CreateExamDto> = {}): CreateExamDto =>
  ({ academicYearId: "year-1", termId: "term-1", name: "Term 1 Exam", ...extra }) as CreateExamDto;

describe("Pass mark can never exceed maximum marks (service)", () => {
  it("createExam rejects passingMark > maxMarks, and accepts passingMark == maxMarks", async () => {
    const { service } = setup();

    await expect(service.createExam(ADMIN, SCHOOL_ID, createExamDto({ maxMarks: 50, passingMark: 51 }))).rejects.toThrow(
      "Pass mark (51) can't be higher than the maximum marks (50)",
    );
    await expect(service.createExam(ADMIN, SCHOOL_ID, createExamDto({ maxMarks: 50, passingMark: 50 }))).resolves.toBeDefined();
  });

  it("createExam checks the pass mark against the default maximum (100) when none is given", async () => {
    const { service } = setup();

    await expect(service.createExam(ADMIN, SCHOOL_ID, createExamDto({ passingMark: 101 }))).rejects.toThrow(BadRequestException);
    await expect(service.createExam(ADMIN, SCHOOL_ID, createExamDto({ passingMark: 100 }))).resolves.toBeDefined();
  });

  it("createExamSubject stores the pass mark, and rejects one above the maximum", async () => {
    const { service, prisma } = setup();
    const dto = { classId: "class-1", subjectId: "subject-1", maxMarks: 40, passingMark: 20 } as CreateExamSubjectDto;

    await service.createExamSubject(ADMIN, SCHOOL_ID, "exam-1", dto);
    expect(prisma.examSubject.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ maxMarks: 40, passingMark: 20 }) }),
    );

    await expect(service.createExamSubject(ADMIN, SCHOOL_ID, "exam-1", { ...dto, passingMark: 41 })).rejects.toThrow(
      "can't be higher than the maximum marks (40)",
    );
  });
});

describe("Exam Type is never the academic period", () => {
  it("a new exam without a type is stored as OTHER, and the term link is what is persisted", async () => {
    const { service, prisma } = setup();

    await service.createExam(ADMIN, SCHOOL_ID, createExamDto());

    expect(prisma.exam.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ type: "OTHER", termId: "term-1" }) }),
    );
  });

  it("an explicitly sent legacy type is still honoured (nothing historical is rewritten)", async () => {
    const { service, prisma } = setup();

    await service.createExam(ADMIN, SCHOOL_ID, createExamDto({ type: "MIDTERM" }));

    expect(prisma.exam.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ type: "MIDTERM" }) }));
  });
});

describe("ExamsService.updateExamSubject — Admin edits maximum marks and pass mark", () => {
  const existing = (overrides: Record<string, unknown> = {}) => ({
    id: EXAM_SUBJECT_ID,
    maxMarks: 100,
    passingMark: 40,
    examDate: null,
    ...overrides,
  });

  it("raises maximum marks, audits before and after, and never touches class or subject", async () => {
    const { service, prisma, audit } = setup();
    prisma.examSubject.findFirst.mockResolvedValue(existing());

    await service.updateExamSubject(ADMIN, SCHOOL_ID, "exam-1", EXAM_SUBJECT_ID, { maxMarks: 150 });

    expect(prisma.examSubject.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ maxMarks: 150 }) }),
    );
    const data = prisma.examSubject.update.mock.calls[0][0].data;
    expect(Object.keys(data)).not.toEqual(expect.arrayContaining(["classId"]));
    expect(Object.keys(data)).not.toEqual(expect.arrayContaining(["subjectId"]));
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "EXAM_SUBJECT_UPDATED",
        actor: ADMIN,
        before: expect.objectContaining({ maxMarks: 100, passingMark: 40 }),
        after: expect.objectContaining({ maxMarks: 150 }),
      }),
    );
  });

  it("rejects a pass mark above the (existing) maximum, and above a maximum being lowered in the same request", async () => {
    const { service, prisma } = setup();
    prisma.examSubject.findFirst.mockResolvedValue(existing());

    await expect(service.updateExamSubject(ADMIN, SCHOOL_ID, "exam-1", EXAM_SUBJECT_ID, { passingMark: 101 })).rejects.toThrow(
      "can't be higher than the maximum marks (100)",
    );
    // Existing pass mark 40 would exceed a new maximum of 30.
    await expect(service.updateExamSubject(ADMIN, SCHOOL_ID, "exam-1", EXAM_SUBJECT_ID, { maxMarks: 30 })).rejects.toThrow(
      "can't be higher than the maximum marks (30)",
    );
    expect(prisma.examSubject.update).not.toHaveBeenCalled();
  });

  it("clears the pass mark with null", async () => {
    const { service, prisma } = setup();
    prisma.examSubject.findFirst.mockResolvedValue(existing());

    await service.updateExamSubject(ADMIN, SCHOOL_ID, "exam-1", EXAM_SUBJECT_ID, { passingMark: null });

    expect(prisma.examSubject.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ passingMark: null }) }),
    );
  });

  it("refuses to lower maximum marks below a mark a student already has", async () => {
    const { service, prisma } = setup();
    prisma.examSubject.findFirst.mockResolvedValue(existing({ passingMark: null }));
    prisma.result.aggregate.mockResolvedValue({ _max: { marksObtained: 88 } });

    await expect(service.updateExamSubject(ADMIN, SCHOOL_ID, "exam-1", EXAM_SUBJECT_ID, { maxMarks: 80 })).rejects.toThrow(
      "can't be lowered to 80: a student already has 88",
    );
    expect(prisma.examSubject.update).not.toHaveBeenCalled();
  });

  it("allows lowering to exactly the highest existing mark", async () => {
    const { service, prisma } = setup();
    prisma.examSubject.findFirst.mockResolvedValue(existing({ passingMark: null }));
    prisma.result.aggregate.mockResolvedValue({ _max: { marksObtained: 80 } });

    await expect(service.updateExamSubject(ADMIN, SCHOOL_ID, "exam-1", EXAM_SUBJECT_ID, { maxMarks: 80 })).resolves.toBeDefined();
  });

  it("an absent student's row is never counted as a mark when checking the highest", async () => {
    const { service, prisma } = setup();
    prisma.examSubject.findFirst.mockResolvedValue(existing({ passingMark: null }));

    await service.updateExamSubject(ADMIN, SCHOOL_ID, "exam-1", EXAM_SUBJECT_ID, { maxMarks: 50 });

    expect(prisma.result.aggregate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { examSubjectId: EXAM_SUBJECT_ID, isAbsent: false } }),
    );
  });

  it("refuses to change maximum marks once results are approved or published", async () => {
    const { service, prisma } = setup();
    prisma.examSubject.findFirst.mockResolvedValue(existing({ passingMark: null }));
    prisma.resultSubmission.count.mockResolvedValue(1);

    await expect(service.updateExamSubject(ADMIN, SCHOOL_ID, "exam-1", EXAM_SUBJECT_ID, { maxMarks: 200 })).rejects.toThrow(
      "can't be changed once results are approved or published",
    );
    expect(prisma.resultSubmission.count).toHaveBeenCalledWith({
      where: { examSubjectId: EXAM_SUBJECT_ID, status: { in: ["APPROVED", "PUBLISHED"] } },
    });
    expect(prisma.examSubject.update).not.toHaveBeenCalled();
  });

  it("the pass mark can still be corrected after publication, and an unchanged maximum triggers no lock check", async () => {
    const { service, prisma } = setup();
    prisma.examSubject.findFirst.mockResolvedValue(existing());
    prisma.resultSubmission.count.mockResolvedValue(3);

    await expect(service.updateExamSubject(ADMIN, SCHOOL_ID, "exam-1", EXAM_SUBJECT_ID, { passingMark: 45, maxMarks: 100 })).resolves.toBeDefined();
    expect(prisma.resultSubmission.count).not.toHaveBeenCalled();
  });
});

describe("Validation at the API boundary (DTOs)", () => {
  const errors = async <T extends object>(cls: new () => T, plain: object) => validate(plainToInstance(cls, plain));

  it("maximum marks must be greater than 0", async () => {
    expect(await errors(CreateExamDto, createExamDto({ academicYearId: UUID, termId: UUID, maxMarks: 0 }))).not.toHaveLength(0);
    expect(await errors(CreateExamDto, createExamDto({ academicYearId: UUID, termId: UUID, maxMarks: -5 }))).not.toHaveLength(0);
    expect(await errors(CreateExamDto, createExamDto({ academicYearId: UUID, termId: UUID, maxMarks: 1 }))).toHaveLength(0);
    expect(await errors(UpdateExamSubjectDto, { maxMarks: 0 })).not.toHaveLength(0);
    expect(await errors(CreateExamSubjectDto, { classId: UUID, subjectId: UUID, maxMarks: 0 })).not.toHaveLength(0);
  });

  it("pass mark must be >= 0 (0 itself is allowed)", async () => {
    expect(await errors(CreateExamSubjectDto, { classId: UUID, subjectId: UUID, passingMark: -1 })).not.toHaveLength(0);
    expect(await errors(CreateExamSubjectDto, { classId: UUID, subjectId: UUID, passingMark: 0 })).toHaveLength(0);
    expect(await errors(UpdateExamSubjectDto, { passingMark: -1 })).not.toHaveLength(0);
    expect(await errors(UpdateExamSubjectDto, { passingMark: null })).toHaveLength(0);
  });

  it("Exam Type is optional metadata, and an unknown value is still rejected", async () => {
    expect(await errors(CreateExamDto, createExamDto({ academicYearId: UUID, termId: UUID }))).toHaveLength(0);
    expect(await errors(CreateExamDto, createExamDto({ academicYearId: UUID, termId: UUID, type: "TERM_3" as never }))).not.toHaveLength(0);
  });

  it("a mark must be >= 0 with at most two decimals", async () => {
    const entry = (marksObtained: number) => errors(EnterMarksDto, { entries: [{ enrollmentId: UUID, marksObtained }] });
    expect(await entry(0)).toHaveLength(0);
    expect(await entry(72.25)).toHaveLength(0);
    expect(await entry(-0.5)).not.toHaveLength(0);
    expect(await entry(72.257)).not.toHaveLength(0);
  });
});

describe("Only an Admin can configure marks; a Teacher only enters them", () => {
  const permissionsOf = (method: keyof ExamsController) =>
    Reflect.getMetadata(PERMISSIONS_KEY, ExamsController.prototype[method]) as string[];

  it("creating an exam, adding a subject, and editing an exam subject (max/pass marks) all need results.approve", () => {
    expect(permissionsOf("create")).toEqual(["results.approve"]);
    expect(permissionsOf("createSubject")).toEqual(["results.approve"]);
    expect(permissionsOf("updateSubject")).toEqual(["results.approve"]);
    expect(permissionsOf("updateTerm")).toEqual(["results.approve"]);
  });

  it("entering marks needs only results.enter", () => {
    expect(permissionsOf("enterMarks")).toEqual(["results.enter"]);
  });

  it("the seeded TEACHER role holds results.enter and results.view but never results.approve", () => {
    const seed = fs.readFileSync(path.resolve(__dirname, "../../../../packages/database/prisma/seed.ts"), "utf8");
    const match = seed.match(/const teacherPermissionKeys = \[([^\]]*)\]/);
    expect(match).not.toBeNull();
    const keys = match![1].split(",").map((k) => k.trim().replace(/"/g, ""));
    expect(keys).toEqual(expect.arrayContaining(["results.enter", "results.view"]));
    expect(keys).not.toContain("results.approve");
  });
});
