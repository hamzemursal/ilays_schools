import { ForbiddenException, NotFoundException } from "@nestjs/common";
import type { AuthenticatedUser } from "../auth/types/authenticated-user";
import { ExamsService } from "./exams.service";
import { AttendanceService } from "../attendance/attendance.service";
import { PrismaService } from "../prisma/prisma.service";
import { SchoolsService } from "../schools/schools.service";
import { AuditService } from "../audit/audit.service";
import { DocumentsService } from "../documents/documents.service";
import { NotificationsService } from "../notifications/notifications.service";
import type { StudentsService } from "../students/students.service";

// Phase 3 — a teacher assigned at two schools. The teacher-scoped actions
// (results, marks, submit, exam paper, attendance) use the teacher-aware
// school gate, which admits a school where the teacher holds an assignment;
// every ADMIN action keeps the strict membership gate; and the gate alone
// never authorizes anything — the exact section/subject/year assignment does.

const SECOND_SCHOOL = "school-second";
const EXAM_SUBJECT_ID = "es-1";
const SECTION_ID = "section-1";

const TEACHER: AuthenticatedUser = {
  id: "teacher-user-1",
  email: "teacher@example.com",
  organizationId: "org-1",
  roles: ["TEACHER"],
  permissions: ["results.enter", "results.view", "attendance.mark", "attendance.view"],
  schoolIds: ["school-home"], // UserSchool: home school only
};
const ADMIN: AuthenticatedUser = { ...TEACHER, id: "admin-1", roles: ["SCHOOL_ADMIN"], permissions: ["results.approve", "results.enter", "results.view"], schoolIds: ["school-home"] };

function examSubject() {
  return {
    id: EXAM_SUBJECT_ID, examId: "exam-1", classId: "class-1", subjectId: "subject-1", maxMarks: 50, examDate: null,
    exam: { id: "exam-1", name: "Term 1 Exam", type: "FINAL", academicYearId: "year-1", academicYear: { name: "2027" }, school: { name: "Saacid" } },
    class: { id: "class-1", name: "Form 1" }, subject: { id: "subject-1", name: "Xisaab" },
  };
}

function examsSetup(actor: AuthenticatedUser, teacherHasAssignment = true) {
  const prisma = {
    examSubject: { findFirst: jest.fn().mockResolvedValue(examSubject()) },
    section: { findFirst: jest.fn().mockResolvedValue({ id: SECTION_ID, classId: "class-1" }), findUnique: jest.fn().mockResolvedValue({ id: SECTION_ID, name: "A" }) },
    studentEnrollment: { findMany: jest.fn().mockResolvedValue([]) },
    resultSubmission: {
      findUnique: jest.fn().mockResolvedValue({ id: "sub-1", status: "SUBMITTED", returnReason: null }),
      update: jest.fn().mockResolvedValue({}),
    },
    result: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0), upsert: jest.fn() },
    teacher: { findFirst: jest.fn().mockResolvedValue(actor.roles.includes("TEACHER") ? { id: "teacher-1" } : null) },
    teacherAssignment: { findFirst: jest.fn().mockResolvedValue(teacherHasAssignment ? { id: "a-1" } : null) },
    $transaction: jest.fn(),
  };
  const schools = {
    findOneAccessibleOrThrow: jest.fn().mockResolvedValue(undefined),
    findOneAccessibleOrTeachingAtOrThrow: jest.fn().mockResolvedValue(undefined),
  };
  const service = new ExamsService(
    prisma as unknown as PrismaService,
    schools as unknown as SchoolsService,
    { record: jest.fn() } as unknown as AuditService,
    { tryGetPhotoUrl: jest.fn().mockResolvedValue(null) } as unknown as DocumentsService,
    { notifyUser: jest.fn(), notifySchoolStaffWithPermission: jest.fn() } as unknown as NotificationsService,
  );
  return { prisma, schools, service };
}

describe("ExamsService — teacher-scoped actions use the teacher-aware school gate", () => {
  it.each([
    ["view results", (s: ReturnType<typeof examsSetup>) => s.service.getResultsForSection(TEACHER, SECOND_SCHOOL, EXAM_SUBJECT_ID, SECTION_ID)],
    ["enter marks", (s: ReturnType<typeof examsSetup>) => s.service.enterMarks(TEACHER, SECOND_SCHOOL, EXAM_SUBJECT_ID, SECTION_ID, { entries: [] })],
    ["submit for review", (s: ReturnType<typeof examsSetup>) => s.service.submitForReview(TEACHER, SECOND_SCHOOL, EXAM_SUBJECT_ID, SECTION_ID)],
    ["list the school's exams (GET /schools/:id/exams)", (s: ReturnType<typeof examsSetup>) => s.service.listExams(TEACHER, SECOND_SCHOOL)],
    ["list one exam's subjects", (s: ReturnType<typeof examsSetup>) => s.service.listExamSubjects(TEACHER, SECOND_SCHOOL, "exam-1")],
    ["list the school's exam papers", (s: ReturnType<typeof examsSetup>) => s.service.listExamPapers(TEACHER, { schoolId: SECOND_SCHOOL })],
  ])("%s at a second school: the gate that admits an assigned teacher is consulted, never the membership-only one", async (_name, run) => {
    const s = examsSetup(TEACHER);

    await run(s).catch(() => undefined); // the rest of each flow isn't what's under test

    expect(s.schools.findOneAccessibleOrTeachingAtOrThrow).toHaveBeenCalledWith(TEACHER, SECOND_SCHOOL);
    expect(s.schools.findOneAccessibleOrThrow).not.toHaveBeenCalled();
  });

  it("when the school gate refuses, nothing else runs — no marks are read or written", async () => {
    const s = examsSetup(TEACHER);
    s.schools.findOneAccessibleOrTeachingAtOrThrow.mockRejectedValue(new NotFoundException("School not found"));

    await expect(s.service.getResultsForSection(TEACHER, SECOND_SCHOOL, EXAM_SUBJECT_ID, SECTION_ID)).rejects.toThrow("School not found");
    expect(s.prisma.studentEnrollment.findMany).not.toHaveBeenCalled();
  });

  it("the gate admits the school but the teacher's assignment for THIS section/subject/year is still required", async () => {
    const s = examsSetup(TEACHER, false); // admitted to the school, no assignment for this section

    await expect(s.service.getResultsForSection(TEACHER, SECOND_SCHOOL, EXAM_SUBJECT_ID, SECTION_ID)).rejects.toThrow(ForbiddenException);
    await expect(s.service.enterMarks(TEACHER, SECOND_SCHOOL, EXAM_SUBJECT_ID, SECTION_ID, { entries: [] })).rejects.toThrow(ForbiddenException);
    expect(s.prisma.teacherAssignment.findFirst).toHaveBeenCalledWith({
      where: { teacherId: "teacher-1", sectionId: SECTION_ID, subjectId: "subject-1", academicYearId: "year-1" },
    });
    expect(s.prisma.result.upsert).not.toHaveBeenCalled();
  });

  it.each([
    ["approve", (s: ReturnType<typeof examsSetup>) => s.service.approveSubmission(ADMIN, SECOND_SCHOOL, EXAM_SUBJECT_ID, SECTION_ID)],
    ["publish", (s: ReturnType<typeof examsSetup>) => s.service.publishSubmission(ADMIN, SECOND_SCHOOL, EXAM_SUBJECT_ID, SECTION_ID)],
    ["return for correction", (s: ReturnType<typeof examsSetup>) => s.service.returnForCorrection(ADMIN, SECOND_SCHOOL, EXAM_SUBJECT_ID, SECTION_ID, { reason: "x" })],
    ["unpublish", (s: ReturnType<typeof examsSetup>) => s.service.unpublishSubmission(ADMIN, SECOND_SCHOOL, EXAM_SUBJECT_ID, SECTION_ID, { reason: "x" })],
    ["create exam", (s: ReturnType<typeof examsSetup>) => s.service.createExam(ADMIN, SECOND_SCHOOL, { academicYearId: "y", termId: "t", name: "n", type: "FINAL" as never })],
    ["change an exam's term", (s: ReturnType<typeof examsSetup>) => s.service.updateExamTerm(ADMIN, SECOND_SCHOOL, "exam-1", { termId: "t" })],
    ["list result submissions for review", (s: ReturnType<typeof examsSetup>) => s.service.listResultSubmissions(ADMIN, { schoolId: SECOND_SCHOOL })],
  ])("admin action '%s' keeps the strict membership gate — School Admin isolation is unchanged", async (_name, run) => {
    const s = examsSetup(ADMIN);
    s.schools.findOneAccessibleOrThrow.mockRejectedValue(new NotFoundException("School not found"));

    await expect(run(s)).rejects.toThrow("School not found");
    expect(s.schools.findOneAccessibleOrTeachingAtOrThrow).not.toHaveBeenCalled();
  });
});

function attendanceSetup(actor: AuthenticatedUser, currentAssignment = true) {
  const prisma = {
    teacher: { findFirst: jest.fn().mockResolvedValue(actor.roles.includes("TEACHER") ? { id: "teacher-1" } : null) },
    academicYear: { findFirst: jest.fn().mockResolvedValue({ id: "year-1" }) },
    teacherAssignment: { findFirst: jest.fn().mockResolvedValue(currentAssignment ? { id: "a-1" } : null) },
  };
  const schools = {
    findOneAccessibleOrThrow: jest.fn().mockResolvedValue(undefined),
    findOneAccessibleOrTeachingAtOrThrow: jest.fn().mockResolvedValue(undefined),
  };
  const service = new AttendanceService(
    prisma as unknown as PrismaService,
    schools as unknown as SchoolsService,
    {} as unknown as StudentsService,
    {} as unknown as AuditService,
    {} as unknown as DocumentsService,
  );
  // The two private teacher gates are the whole authorization surface for marking/viewing a section.
  const edit = (a: AuthenticatedUser, school = SECOND_SCHOOL) => (service as unknown as { assertCanEditSection: (a: AuthenticatedUser, s: string, sec: string) => Promise<void> }).assertCanEditSection(a, school, SECTION_ID);
  const view = (a: AuthenticatedUser, school = SECOND_SCHOOL) => (service as unknown as { assertCanViewSectionHistory: (a: AuthenticatedUser, s: string, sec: string) => Promise<unknown> }).assertCanViewSectionHistory(a, school, SECTION_ID);
  return { prisma, schools, edit, view };
}

describe("AttendanceService — a teacher assigned at a second school", () => {
  it("can mark/manage a section there: the teacher-aware gate admits the school, the current-year assignment authorizes", async () => {
    const s = attendanceSetup(TEACHER);

    await expect(s.edit(TEACHER)).resolves.toBeUndefined();

    expect(s.schools.findOneAccessibleOrTeachingAtOrThrow).toHaveBeenCalledWith(TEACHER, SECOND_SCHOOL);
    expect(s.schools.findOneAccessibleOrThrow).not.toHaveBeenCalled();
    expect(s.prisma.teacherAssignment.findFirst).toHaveBeenCalledWith({ where: { teacherId: "teacher-1", sectionId: SECTION_ID, academicYearId: "year-1" } });
  });

  it("can view that section's history through the same gate", async () => {
    const s = attendanceSetup(TEACHER);

    await expect(s.view(TEACHER)).resolves.toEqual({ restrictToOwnRecords: false });

    expect(s.schools.findOneAccessibleOrTeachingAtOrThrow).toHaveBeenCalledWith(TEACHER, SECOND_SCHOOL);
  });

  it("a section they are NOT assigned to at that school stays off-limits, even though the school itself is admitted", async () => {
    const s = attendanceSetup(TEACHER, false);

    await expect(s.edit(TEACHER)).rejects.toThrow("You are not currently assigned to this section");
    await expect(s.view(TEACHER)).rejects.toThrow("You are not assigned to this section");
  });

  it("a school where the teacher has no assignment is refused by the gate itself", async () => {
    const s = attendanceSetup(TEACHER);
    s.schools.findOneAccessibleOrTeachingAtOrThrow.mockRejectedValue(new NotFoundException("School not found"));

    await expect(s.edit(TEACHER, "school-with-no-assignment")).rejects.toThrow("School not found");
    expect(s.prisma.teacherAssignment.findFirst).not.toHaveBeenCalled();
  });

  it("a School Admin (no Teacher profile) passes only where the gate admits them, and is never assignment-checked", async () => {
    const s = attendanceSetup(ADMIN);

    await expect(s.edit(ADMIN, "school-home")).resolves.toBeUndefined();
    expect(s.prisma.teacherAssignment.findFirst).not.toHaveBeenCalled();

    s.schools.findOneAccessibleOrTeachingAtOrThrow.mockRejectedValue(new NotFoundException("School not found"));
    await expect(s.edit(ADMIN, SECOND_SCHOOL)).rejects.toThrow("School not found");
  });
});
