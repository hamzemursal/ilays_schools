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
