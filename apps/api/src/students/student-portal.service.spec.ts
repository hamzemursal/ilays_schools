import { ForbiddenException, NotFoundException } from "@nestjs/common";
import type { AuthenticatedUser } from "../auth/types/authenticated-user";
import { StudentPortalService } from "./student-portal.service";
import { PrismaService } from "../prisma/prisma.service";

const ACTOR: AuthenticatedUser = {
  id: "user-1",
  email: "student@example.com",
  organizationId: "org-1",
  roles: ["STUDENT"],
  permissions: [],
  schoolIds: [],
};

type MockPrisma = {
  student: { findFirst: jest.Mock };
  studentEnrollment: { findFirst: jest.Mock; findMany: jest.Mock };
  attendance: { groupBy: jest.Mock; findMany: jest.Mock };
  classSubject: { findMany: jest.Mock };
  teacherAssignment: { findMany: jest.Mock };
  teacher: { findMany: jest.Mock };
  userRole: { findMany: jest.Mock };
  result: { findMany: jest.Mock };
  term: { findMany: jest.Mock };
  invoice: { findMany: jest.Mock };
  announcement: { findMany: jest.Mock };
};

function createMockPrisma(): MockPrisma {
  return {
    student: { findFirst: jest.fn() },
    studentEnrollment: { findFirst: jest.fn(), findMany: jest.fn() },
    attendance: { groupBy: jest.fn(), findMany: jest.fn() },
    classSubject: { findMany: jest.fn() },
    teacherAssignment: { findMany: jest.fn() },
    teacher: { findMany: jest.fn() },
    userRole: { findMany: jest.fn() },
    result: { findMany: jest.fn() },
    term: { findMany: jest.fn() },
    invoice: { findMany: jest.fn() },
    announcement: { findMany: jest.fn() },
  };
}

function createService(prisma: MockPrisma) {
  return new StudentPortalService(prisma as unknown as PrismaService);
}

const SECONDARY_ENROLLMENT = {
  id: "enr-1",
  status: "ACTIVE",
  studentNumber: "STU-1",
  rollNumber: 5,
  academicYearId: "year-1",
  classId: "class-1",
  sectionId: "sec-1",
  schoolId: "school-1",
  school: { name: "Ilays Secondary" },
  academicYear: { name: "2028" },
  class: { name: "Form 2", division: { type: "SECONDARY" } },
  section: { name: "A" },
};

describe("StudentPortalService — getSelfOrThrow gate (re-verified on every call)", () => {
  let prisma: MockPrisma;
  let service: StudentPortalService;

  beforeEach(() => {
    prisma = createMockPrisma();
    service = createService(prisma);
  });

  it("throws NotFoundException when this account has no linked Student profile", async () => {
    prisma.student.findFirst.mockResolvedValue(null);
    await expect(service.myProfile(ACTOR)).rejects.toThrow(NotFoundException);
  });

  it("throws ForbiddenException when the student has no ACTIVE enrollment", async () => {
    prisma.student.findFirst.mockResolvedValue({ id: "student-1" });
    prisma.studentEnrollment.findFirst.mockResolvedValue(null);
    await expect(service.myProfile(ACTOR)).rejects.toThrow("No active enrollment found for this account");
  });

  it("throws ForbiddenException when the current enrollment's division is PRIMARY, not SECONDARY", async () => {
    prisma.student.findFirst.mockResolvedValue({ id: "student-1" });
    prisma.studentEnrollment.findFirst.mockResolvedValue({
      ...SECONDARY_ENROLLMENT,
      class: { name: "Class 5", division: { type: "PRIMARY" } },
    });
    await expect(service.myProfile(ACTOR)).rejects.toThrow(
      "Student Portal access is only available to secondary students",
    );
  });

  it("resolves cleanly for a SECONDARY student with an ACTIVE enrollment", async () => {
    prisma.student.findFirst.mockResolvedValue({ id: "student-1", firstName: "A", lastName: "One", dateOfBirth: new Date(), sex: "MALE", currentStatus: "ACTIVE" });
    prisma.studentEnrollment.findFirst.mockResolvedValue(SECONDARY_ENROLLMENT);
    await expect(service.myProfile(ACTOR)).resolves.toBeDefined();
  });
});

describe("StudentPortalService.myProfile", () => {
  it("maps loginId from the enrollment's studentNumber, and the current enrollment's details", async () => {
    const prisma = createMockPrisma();
    prisma.student.findFirst.mockResolvedValue({ id: "student-1", firstName: "A", lastName: "One", dateOfBirth: new Date("2012-01-01"), sex: "MALE", currentStatus: "ACTIVE" });
    prisma.studentEnrollment.findFirst.mockResolvedValue(SECONDARY_ENROLLMENT);
    const service = createService(prisma);

    const result = await service.myProfile(ACTOR);

    expect(result.loginId).toBe("STU-1");
    expect(result.enrollment).toEqual({
      status: "ACTIVE",
      schoolName: "Ilays Secondary",
      academicYearId: "year-1",
      academicYearName: "2028",
      className: "Form 2",
      sectionName: "A",
      rollNumber: 5,
    });
  });
});

describe("StudentPortalService.myAcademicYears", () => {
  let prisma: MockPrisma;
  let service: StudentPortalService;

  beforeEach(() => {
    prisma = createMockPrisma();
    service = createService(prisma);
    prisma.student.findFirst.mockResolvedValue({ id: "student-1" });
    prisma.studentEnrollment.findFirst.mockResolvedValue(SECONDARY_ENROLLMENT);
  });

  it("de-duplicates repeated academicYearId across multiple enrollments", async () => {
    prisma.studentEnrollment.findMany.mockResolvedValue([
      { id: "e1", academicYearId: "year-1", academicYear: { name: "2028", isCurrent: true } },
      { id: "e2", academicYearId: "year-1", academicYear: { name: "2028", isCurrent: true } },
    ]);
    prisma.attendance.groupBy.mockResolvedValue([]);

    const result = await service.myAcademicYears(ACTOR);

    expect(result).toHaveLength(1);
  });

  it("flags hasAttendance from the attendance groupBy per enrollment-year", async () => {
    prisma.studentEnrollment.findMany.mockResolvedValue([
      { id: "e1", academicYearId: "year-1", academicYear: { name: "2028", isCurrent: true } },
    ]);
    prisma.attendance.groupBy.mockResolvedValue([{ enrollmentId: "e1" }]);

    const result = await service.myAcademicYears(ACTOR);

    expect(result[0].hasAttendance).toBe(true);
  });
});

describe("StudentPortalService.mySubjects", () => {
  let prisma: MockPrisma;
  let service: StudentPortalService;

  beforeEach(() => {
    prisma = createMockPrisma();
    service = createService(prisma);
    prisma.student.findFirst.mockResolvedValue({ id: "student-1" });
    prisma.studentEnrollment.findFirst
      .mockResolvedValueOnce(SECONDARY_ENROLLMENT) // getSelfOrThrow's own check
      .mockResolvedValueOnce(SECONDARY_ENROLLMENT); // mySubjects' own lookup
  });

  it("returns an empty array when no matching enrollment resolves for the subjects lookup", async () => {
    prisma.studentEnrollment.findFirst.mockReset();
    prisma.studentEnrollment.findFirst.mockResolvedValueOnce(SECONDARY_ENROLLMENT).mockResolvedValueOnce(null);
    const result = await service.mySubjects(ACTOR);
    expect(result).toEqual([]);
  });

  it("matches each class subject to its assigned teacher, null when unassigned", async () => {
    prisma.classSubject.findMany.mockResolvedValue([{ subjectId: "subj-1", subject: { name: "Math", code: "MTH" } }]);
    prisma.teacherAssignment.findMany.mockResolvedValue([{ subjectId: "subj-1", teacher: { firstName: "Amran", lastName: "Hassan" } }]);

    const result = await service.mySubjects(ACTOR);

    expect(result).toEqual([{ subjectId: "subj-1", name: "Math", code: "MTH", teacher: { firstName: "Amran", lastName: "Hassan" } }]);
  });
});

describe("StudentPortalService.myAttendance — marker name resolution", () => {
  let prisma: MockPrisma;
  let service: StudentPortalService;

  beforeEach(() => {
    prisma = createMockPrisma();
    service = createService(prisma);
    prisma.student.findFirst.mockResolvedValue({ id: "student-1" });
    prisma.studentEnrollment.findFirst.mockResolvedValue(SECONDARY_ENROLLMENT);
  });

  it("computes percentage as (present + late) / total", async () => {
    prisma.attendance.findMany.mockResolvedValue([
      { id: "a1", status: "PRESENT", date: new Date(), note: null, markedByUserId: "u1", enrollment: { class: { name: "C" }, section: { name: "A" } } },
      { id: "a2", status: "ABSENT", date: new Date(), note: null, markedByUserId: "u1", enrollment: { class: { name: "C" }, section: { name: "A" } } },
    ]);
    prisma.teacher.findMany.mockResolvedValue([]);
    prisma.userRole.findMany.mockResolvedValue([]);

    const result = await service.myAttendance(ACTOR);

    expect(result.summary.percentage).toBe(50);
  });

  it("prefers a real Teacher's name over a role label when the marker matches a Teacher", async () => {
    prisma.attendance.findMany.mockResolvedValue([
      { id: "a1", status: "PRESENT", date: new Date(), note: null, markedByUserId: "teacher-user-1", enrollment: { class: { name: "C" }, section: { name: "A" } } },
    ]);
    prisma.teacher.findMany.mockResolvedValue([{ userId: "teacher-user-1", firstName: "Amran", lastName: "Hassan" }]);
    prisma.userRole.findMany.mockResolvedValue([]);

    const result = await service.myAttendance(ACTOR);

    expect(result.records[0].markedByName).toBe("Amran Hassan");
    expect(prisma.userRole.findMany).not.toHaveBeenCalled();
  });

  it("falls back to a role label (e.g. School Admin) when the marker isn't a Teacher", async () => {
    prisma.attendance.findMany.mockResolvedValue([
      { id: "a1", status: "PRESENT", date: new Date(), note: null, markedByUserId: "admin-user-1", enrollment: { class: { name: "C" }, section: { name: "A" } } },
    ]);
    prisma.teacher.findMany.mockResolvedValue([]);
    prisma.userRole.findMany.mockResolvedValue([{ userId: "admin-user-1", role: { name: "SCHOOL_ADMIN" } }]);

    const result = await service.myAttendance(ACTOR);

    expect(result.records[0].markedByName).toBe("School Admin");
  });

  it("resolves to null (not a fabricated name) when the marker matches neither a Teacher nor any role", async () => {
    prisma.attendance.findMany.mockResolvedValue([
      { id: "a1", status: "PRESENT", date: new Date(), note: null, markedByUserId: "ghost-user", enrollment: { class: { name: "C" }, section: { name: "A" } } },
    ]);
    prisma.teacher.findMany.mockResolvedValue([]);
    prisma.userRole.findMany.mockResolvedValue([]);

    const result = await service.myAttendance(ACTOR);

    expect(result.records[0].markedByName).toBeNull();
  });

  it("resolves each distinct marker only once, not per record", async () => {
    prisma.attendance.findMany.mockResolvedValue([
      { id: "a1", status: "PRESENT", date: new Date(), note: null, markedByUserId: "teacher-user-1", enrollment: { class: { name: "C" }, section: { name: "A" } } },
      { id: "a2", status: "ABSENT", date: new Date(), note: null, markedByUserId: "teacher-user-1", enrollment: { class: { name: "C" }, section: { name: "A" } } },
    ]);
    prisma.teacher.findMany.mockResolvedValue([{ userId: "teacher-user-1", firstName: "Amran", lastName: "Hassan" }]);
    prisma.userRole.findMany.mockResolvedValue([]);

    await service.myAttendance(ACTOR);

    expect(prisma.teacher.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: { in: ["teacher-user-1"] } } }),
    );
  });
});

describe("StudentPortalService.myResults", () => {
  it("only queries PUBLISHED result submissions and computes percentage", async () => {
    const prisma = createMockPrisma();
    prisma.student.findFirst.mockResolvedValue({ id: "student-1" });
    prisma.studentEnrollment.findFirst.mockResolvedValue(SECONDARY_ENROLLMENT);
    prisma.result.findMany.mockResolvedValue([
      {
        id: "res-1",
        marksObtained: "40.00",
        examSubject: { maxMarks: 50, examDate: new Date(), exam: { name: "Final", type: "FINAL", academicYear: { name: "2028" } }, subject: { name: "Math" } },
        resultSubmission: { publishedAt: new Date() },
      },
    ]);
    const service = createService(prisma);

    const result = await service.myResults(ACTOR);

    expect(prisma.result.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { enrollment: { studentId: "student-1" }, resultSubmission: { status: "PUBLISHED" }, isAbsent: false } }),
    );
    expect(result[0].percentage).toBe(80);
  });
});

describe("StudentPortalService.myInvoices", () => {
  it("sums every payment toward paid/balance regardless of status — unlike GuardianPortalService, no POSTED-only filter", async () => {
    const prisma = createMockPrisma();
    prisma.student.findFirst.mockResolvedValue({ id: "student-1" });
    prisma.studentEnrollment.findFirst.mockResolvedValue(SECONDARY_ENROLLMENT);
    prisma.invoice.findMany.mockResolvedValue([
      {
        id: "inv-1",
        amount: "100.00",
        status: "PARTIALLY_PAID",
        dueDate: new Date(),
        feeStructure: { name: "Tuition" },
        payments: [{ id: "p1", amount: "40.00", method: "CASH", paidAt: new Date(), reference: null, status: "REVERSED" }],
      },
    ]);
    const service = createService(prisma);

    const result = await service.myInvoices(ACTOR);

    // Documents the real, as-written behavior: this method sums every
    // payment row regardless of status, unlike GuardianPortalService's
    // myChildInvoices which filters to POSTED only.
    expect(result[0].paid).toBe(40);
    expect(result[0].balance).toBe(60);
  });

  it("never queries or merges Charge rows — only Invoice, unlike GuardianPortalService", async () => {
    const prisma = createMockPrisma();
    prisma.student.findFirst.mockResolvedValue({ id: "student-1" });
    prisma.studentEnrollment.findFirst.mockResolvedValue(SECONDARY_ENROLLMENT);
    prisma.invoice.findMany.mockResolvedValue([]);
    const service = createService(prisma);

    const result = await service.myInvoices(ACTOR);

    expect(result).toEqual([]);
  });
});

describe("StudentPortalService.myAnnouncements", () => {
  it("scopes to the student's own single current school, audience ALL only (no STUDENTS category exists)", async () => {
    const prisma = createMockPrisma();
    prisma.student.findFirst.mockResolvedValue({ id: "student-1" });
    prisma.studentEnrollment.findFirst.mockResolvedValue(SECONDARY_ENROLLMENT);
    prisma.announcement.findMany.mockResolvedValue([]);
    const service = createService(prisma);

    await service.myAnnouncements(ACTOR);

    expect(prisma.announcement.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { schoolId: "school-1", audience: "ALL" } }),
    );
  });
});

describe("StudentPortalService.myResultsReport — Term 1 / Term 2 / Annual, own data only", () => {
  const term = (id: string, name: string) => ({ id, name, weight: 50 });
  const row = (id: string, termId: string, marks: number, max: number) => ({
    id,
    marksObtained: marks,
    examSubject: { maxMarks: max, examDate: new Date("2028-03-01"), subject: { name: "Math" }, exam: { name: "Exam", type: "FINAL", termId } },
    resultSubmission: { publishedAt: new Date("2028-03-10") },
  });
  const reportEnrollment = {
    ...SECONDARY_ENROLLMENT,
    academicYear: { id: "year-1", name: "2028", isCurrent: true },
  };

  function setup() {
    const prisma = createMockPrisma();
    prisma.student.findFirst.mockResolvedValue({ id: "student-1" });
    // getSelfOrThrow gate
    prisma.studentEnrollment.findFirst.mockResolvedValue(SECONDARY_ENROLLMENT);
    // the report's own enrollment lookup
    prisma.studentEnrollment.findMany.mockResolvedValue([reportEnrollment]);
    prisma.term.findMany.mockResolvedValue([term("t1", "Term 1"), term("t2", "Term 2")]);
    prisma.result.findMany.mockResolvedValue([]);
    return { prisma, service: createService(prisma) };
  }

  it("resolves the student strictly from the authenticated actor's own userId — no student id is accepted", async () => {
    const { prisma, service } = setup();

    await service.myResultsReport(ACTOR);

    expect(prisma.student.findFirst).toHaveBeenCalledWith({ where: { userId: "user-1" } });
    expect(prisma.studentEnrollment.findMany.mock.calls[0][0].where).toEqual({ studentId: "student-1" });
  });

  it("returns Term 1, Term 2 and the annual result with eligibility", async () => {
    const { prisma, service } = setup();
    prisma.result.findMany.mockResolvedValue([row("r1", "t1", 80, 100), row("r2", "t2", 60, 100)]);

    const report = await service.myResultsReport(ACTOR);

    expect(report.terms[0]).toMatchObject({ name: "Term 1", percentage: 80 });
    expect(report.terms[1]).toMatchObject({ name: "Term 2", percentage: 60 });
    expect(report.annual).toMatchObject({ annualPercentage: 70, eligible: true });
  });

  it("only asks the database for PUBLISHED results — Draft/Submitted/Needs Correction/Approved never reach the response", async () => {
    const { prisma, service } = setup();

    await service.myResultsReport(ACTOR);

    expect(prisma.result.findMany.mock.calls[0][0].where).toMatchObject({
      resultSubmission: { status: "PUBLISHED" },
      isAbsent: false,
    });
  });

  it("the result query is pinned to this student's own enrollment ids — another student's rows can never match", async () => {
    const { prisma, service } = setup();

    await service.myResultsReport(ACTOR);

    expect(prisma.result.findMany.mock.calls[0][0].where.enrollmentId).toEqual({ in: ["enr-1"] });
  });

  it("scopes to a requested historical year with {studentId, academicYearId} — not combined with status ACTIVE", async () => {
    const { prisma, service } = setup();

    await service.myResultsReport(ACTOR, "year-1");

    expect(prisma.studentEnrollment.findMany.mock.calls[0][0].where).toEqual({ studentId: "student-1", academicYearId: "year-1" });
  });

  it("a year this student was never enrolled in is NotFound", async () => {
    const { prisma, service } = setup();
    prisma.studentEnrollment.findMany.mockResolvedValue([]);

    await expect(service.myResultsReport(ACTOR, "another-students-year")).rejects.toThrow(NotFoundException);
    expect(prisma.result.findMany).not.toHaveBeenCalled();
  });

  it("keeps the Student Portal gate: an account with no linked Student profile gets nothing", async () => {
    const { prisma, service } = setup();
    prisma.student.findFirst.mockResolvedValue(null);

    await expect(service.myResultsReport(ACTOR)).rejects.toThrow(NotFoundException);
    expect(prisma.result.findMany).not.toHaveBeenCalled();
  });

  it("keeps the Student Portal gate: a PRIMARY-division student gets nothing", async () => {
    const { prisma, service } = setup();
    prisma.studentEnrollment.findFirst.mockResolvedValue({ ...SECONDARY_ENROLLMENT, class: { name: "Class 5", division: { type: "PRIMARY" } } });

    await expect(service.myResultsReport(ACTOR)).rejects.toThrow(ForbiddenException);
    expect(prisma.result.findMany).not.toHaveBeenCalled();
  });
});

describe("StudentPortalService.myAttendance — two sessions, Not Recorded is never Absent", () => {
  const rec = (id: string, date: string, session: "MORNING" | "AFTERNOON", status: string) => ({
    id,
    date: new Date(date),
    session,
    status,
    note: null,
    markedByUserId: "marker-1",
    enrollment: { class: { name: "Form 2" }, section: { name: "A" }, academicYear: { name: "2028" } },
  });

  it("returns each session as its own record, so Morning Present / Afternoon Absent stays separable", async () => {
    const prisma = createMockPrisma();
    prisma.student.findFirst.mockResolvedValue({ id: "student-1" });
    prisma.studentEnrollment.findFirst.mockResolvedValue(SECONDARY_ENROLLMENT);
    prisma.teacher.findMany.mockResolvedValue([]);
    prisma.userRole.findMany.mockResolvedValue([]);
    prisma.attendance.findMany.mockResolvedValue([
      rec("a1", "2028-03-01", "MORNING", "PRESENT"),
      rec("a2", "2028-03-01", "AFTERNOON", "ABSENT"),
    ]);
    const service = createService(prisma);

    const { records } = await service.myAttendance(ACTOR, "year-1");

    expect(records.map((r) => [r.session, r.status])).toEqual([
      ["MORNING", "PRESENT"],
      ["AFTERNOON", "ABSENT"],
    ]);
  });

  it("a session that was never recorded is simply not a record: it is not counted as absent and not fabricated", async () => {
    const prisma = createMockPrisma();
    prisma.student.findFirst.mockResolvedValue({ id: "student-1" });
    prisma.studentEnrollment.findFirst.mockResolvedValue(SECONDARY_ENROLLMENT);
    prisma.teacher.findMany.mockResolvedValue([]);
    prisma.userRole.findMany.mockResolvedValue([]);
    prisma.attendance.findMany.mockResolvedValue([rec("a1", "2028-03-01", "MORNING", "PRESENT")]);
    const service = createService(prisma);

    const { summary, records } = await service.myAttendance(ACTOR, "year-1");

    expect(records).toHaveLength(1);
    expect(summary).toMatchObject({ total: 1, present: 1, absent: 0, percentage: 100 });
  });

  it("scopes to the requested academic year and to the actor's own student only", async () => {
    const prisma = createMockPrisma();
    prisma.student.findFirst.mockResolvedValue({ id: "student-1" });
    prisma.studentEnrollment.findFirst.mockResolvedValue(SECONDARY_ENROLLMENT);
    prisma.attendance.findMany.mockResolvedValue([]);
    const service = createService(prisma);

    await service.myAttendance(ACTOR, "year-2027");

    expect(prisma.attendance.findMany.mock.calls[0][0].where).toEqual({
      enrollment: { studentId: "student-1", academicYearId: "year-2027" },
    });
  });
});
