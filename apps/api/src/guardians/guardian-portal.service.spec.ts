import { NotFoundException } from "@nestjs/common";
import type { AuthenticatedUser } from "../auth/types/authenticated-user";
import { GuardianPortalService } from "./guardian-portal.service";
import { PrismaService } from "../prisma/prisma.service";
import { GuardiansService } from "./guardians.service";

const ACTOR: AuthenticatedUser = {
  id: "user-1",
  email: "parent@example.com",
  organizationId: "org-1",
  roles: ["PARENT"],
  permissions: [],
  schoolIds: [],
};

type MockPrisma = {
  guardian: { findFirst: jest.Mock };
  studentGuardian: { findMany: jest.Mock };
  student: { findUniqueOrThrow: jest.Mock };
  studentEnrollment: { findMany: jest.Mock; findFirst: jest.Mock };
  attendance: { groupBy: jest.Mock; findMany: jest.Mock };
  classSubject: { findMany: jest.Mock };
  teacherAssignment: { findMany: jest.Mock };
  result: { findMany: jest.Mock };
  term: { findMany: jest.Mock };
  invoice: { findMany: jest.Mock };
  charge: { findMany: jest.Mock };
  announcement: { findMany: jest.Mock };
  notification: { findMany: jest.Mock; findFirst: jest.Mock; update: jest.Mock };
};

function createMockPrisma(): MockPrisma {
  return {
    guardian: { findFirst: jest.fn() },
    studentGuardian: { findMany: jest.fn() },
    student: { findUniqueOrThrow: jest.fn() },
    studentEnrollment: { findMany: jest.fn(), findFirst: jest.fn() },
    attendance: { groupBy: jest.fn(), findMany: jest.fn() },
    classSubject: { findMany: jest.fn() },
    teacherAssignment: { findMany: jest.fn() },
    result: { findMany: jest.fn() },
    term: { findMany: jest.fn() },
    invoice: { findMany: jest.fn() },
    charge: { findMany: jest.fn() },
    announcement: { findMany: jest.fn() },
    notification: { findMany: jest.fn(), findFirst: jest.fn(), update: jest.fn() },
  };
}

function createService(prisma: MockPrisma) {
  const guardians = {
    getSelfGuardianOrThrow: jest.fn().mockResolvedValue({ id: "guardian-1" }),
    assertGuardianCanAccessStudent: jest.fn().mockResolvedValue(undefined),
  };
  const service = new GuardianPortalService(prisma as unknown as PrismaService, guardians as unknown as GuardiansService);
  return { service, guardians };
}

describe("GuardianPortalService.myProfile", () => {
  it("resolves the guardian by the actor's own userId", async () => {
    const prisma = createMockPrisma();
    prisma.guardian.findFirst.mockResolvedValue({ id: "guardian-1" });
    const { service } = createService(prisma);

    await service.myProfile(ACTOR);

    expect(prisma.guardian.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: "user-1" } }));
  });
});

describe("GuardianPortalService.myChildren", () => {
  let prisma: MockPrisma;
  let service: GuardianPortalService;

  beforeEach(() => {
    prisma = createMockPrisma();
    ({ service } = createService(prisma));
  });

  it("scopes to the guardian's own ACTIVE links only", async () => {
    prisma.studentGuardian.findMany.mockResolvedValue([]);
    await service.myChildren(ACTOR);
    expect(prisma.studentGuardian.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { guardianId: "guardian-1", status: "ACTIVE" } }),
    );
  });

  it("maps the current enrollment's school/class/section/year when one exists", async () => {
    prisma.studentGuardian.findMany.mockResolvedValue([
      {
        studentId: "student-1",
        relationship: "MOTHER",
        isPrimaryContact: true,
        student: {
          firstName: "A",
          lastName: "One",
          sex: "FEMALE",
          dateOfBirth: new Date("2015-01-01"),
          currentStatus: "ACTIVE",
          enrollments: [
            {
              school: { name: "Ilays Primary" },
              class: { name: "Class 3" },
              section: { name: "B" },
              academicYear: { name: "2028" },
              studentNumber: "STU-1",
              rollNumber: 5,
            },
          ],
        },
      },
    ]);

    const result = await service.myChildren(ACTOR);

    expect(result[0].enrollment).toEqual({
      schoolName: "Ilays Primary",
      className: "Class 3",
      sectionName: "B",
      academicYearName: "2028",
      studentNumber: "STU-1",
      rollNumber: 5,
    });
  });

  it("returns enrollment: null for a child with no current ACTIVE enrollment", async () => {
    prisma.studentGuardian.findMany.mockResolvedValue([
      {
        studentId: "student-1",
        relationship: "MOTHER",
        isPrimaryContact: true,
        student: { firstName: "A", lastName: "One", sex: "FEMALE", dateOfBirth: new Date("2015-01-01"), currentStatus: "COMPLETED", enrollments: [] },
      },
    ]);

    const result = await service.myChildren(ACTOR);

    expect(result[0].enrollment).toBeNull();
  });
});

describe("GuardianPortalService.myChild", () => {
  it("checks guardian-child access before returning the student", async () => {
    const prisma = createMockPrisma();
    prisma.student.findUniqueOrThrow.mockResolvedValue({ id: "student-1" });
    const { service, guardians } = createService(prisma);

    await service.myChild(ACTOR, "student-1");

    expect(guardians.assertGuardianCanAccessStudent).toHaveBeenCalledWith(ACTOR, "student-1");
  });
});

describe("GuardianPortalService.myChildAcademicYears", () => {
  let prisma: MockPrisma;
  let service: GuardianPortalService;

  beforeEach(() => {
    prisma = createMockPrisma();
    ({ service } = createService(prisma));
  });

  it("de-duplicates repeated academicYearId across multiple enrollments in the same year", async () => {
    prisma.studentEnrollment.findMany.mockResolvedValue([
      { id: "enr-1", academicYearId: "year-1", academicYear: { name: "2028", isCurrent: true } },
      { id: "enr-2", academicYearId: "year-1", academicYear: { name: "2028", isCurrent: true } },
      { id: "enr-3", academicYearId: "year-2", academicYear: { name: "2027", isCurrent: false } },
    ]);
    prisma.attendance.groupBy.mockResolvedValue([]);

    const result = await service.myChildAcademicYears(ACTOR, "student-1");

    expect(result).toHaveLength(2);
    expect(result.map((y) => y.id)).toEqual(["year-1", "year-2"]);
  });

  it("flags hasAttendance true only when at least one of that year's enrollments has an attendance row", async () => {
    prisma.studentEnrollment.findMany.mockResolvedValue([
      { id: "enr-1", academicYearId: "year-1", academicYear: { name: "2028", isCurrent: true } },
      { id: "enr-2", academicYearId: "year-2", academicYear: { name: "2027", isCurrent: false } },
    ]);
    prisma.attendance.groupBy.mockResolvedValue([{ enrollmentId: "enr-1" }]);

    const result = await service.myChildAcademicYears(ACTOR, "student-1");

    expect(result.find((y) => y.id === "year-1")?.hasAttendance).toBe(true);
    expect(result.find((y) => y.id === "year-2")?.hasAttendance).toBe(false);
  });
});

describe("GuardianPortalService.myChildSubjects", () => {
  let prisma: MockPrisma;
  let service: GuardianPortalService;

  beforeEach(() => {
    prisma = createMockPrisma();
    ({ service } = createService(prisma));
  });

  it("returns an empty array when the student has no matching enrollment", async () => {
    prisma.studentEnrollment.findFirst.mockResolvedValue(null);
    const result = await service.myChildSubjects(ACTOR, "student-1");
    expect(result).toEqual([]);
  });

  it("defaults to the student's current ACTIVE enrollment when no academicYearId is given", async () => {
    prisma.studentEnrollment.findFirst.mockResolvedValue(null);
    await service.myChildSubjects(ACTOR, "student-1");
    expect(prisma.studentEnrollment.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { studentId: "student-1", status: "ACTIVE" } }),
    );
  });

  it("scopes to a specific historical academicYearId when given, without the ACTIVE filter", async () => {
    prisma.studentEnrollment.findFirst.mockResolvedValue(null);
    await service.myChildSubjects(ACTOR, "student-1", "year-old");
    expect(prisma.studentEnrollment.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { studentId: "student-1", academicYearId: "year-old" } }),
    );
  });

  it("matches each class subject to its assigned teacher, null when unassigned", async () => {
    prisma.studentEnrollment.findFirst.mockResolvedValue({ classId: "class-1", sectionId: "sec-1", academicYearId: "year-1" });
    prisma.classSubject.findMany.mockResolvedValue([
      { subjectId: "subj-1", subject: { name: "Math", code: "MTH" } },
      { subjectId: "subj-2", subject: { name: "Science", code: "SCI" } },
    ]);
    prisma.teacherAssignment.findMany.mockResolvedValue([
      { subjectId: "subj-1", teacher: { firstName: "Amran", lastName: "Hassan" } },
    ]);

    const result = await service.myChildSubjects(ACTOR, "student-1");

    expect(result).toEqual([
      { subjectId: "subj-1", name: "Math", code: "MTH", teacher: { firstName: "Amran", lastName: "Hassan" } },
      { subjectId: "subj-2", name: "Science", code: "SCI", teacher: null },
    ]);
  });
});

describe("GuardianPortalService.myChildAttendance", () => {
  let prisma: MockPrisma;
  let service: GuardianPortalService;

  beforeEach(() => {
    prisma = createMockPrisma();
    ({ service } = createService(prisma));
  });

  it("returns an all-null/zero summary when there are no attendance records at all", async () => {
    prisma.attendance.findMany.mockResolvedValue([]);
    const result = await service.myChildAttendance(ACTOR, "student-1");
    expect(result.summary).toEqual({ total: 0, present: 0, absent: 0, late: 0, excused: 0, percentage: null });
  });

  it("computes percentage as (present + late) / total, rounded to one decimal", async () => {
    prisma.attendance.findMany.mockResolvedValue([
      { id: "a1", status: "PRESENT", date: new Date(), note: null, enrollment: { class: { name: "C1" }, section: { name: "A" } } },
      { id: "a2", status: "LATE", date: new Date(), note: null, enrollment: { class: { name: "C1" }, section: { name: "A" } } },
      { id: "a3", status: "ABSENT", date: new Date(), note: null, enrollment: { class: { name: "C1" }, section: { name: "A" } } },
    ]);

    const result = await service.myChildAttendance(ACTOR, "student-1");

    // (2 present+late) / 3 total = 66.666...% -> rounded to 66.7
    expect(result.summary.percentage).toBe(66.7);
    expect(result.summary).toMatchObject({ total: 3, present: 1, absent: 1, late: 1, excused: 0 });
  });

  it("filters by academicYearId only when one is given", async () => {
    prisma.attendance.findMany.mockResolvedValue([]);
    await service.myChildAttendance(ACTOR, "student-1", "year-1");
    expect(prisma.attendance.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { enrollment: { studentId: "student-1", academicYearId: "year-1" } } }),
    );
  });
});

describe("GuardianPortalService.myChildResults", () => {
  it("only queries results whose resultSubmission status is PUBLISHED, and computes percentage", async () => {
    const prisma = createMockPrisma();
    prisma.result.findMany.mockResolvedValue([
      {
        id: "res-1",
        marksObtained: "45.00",
        examSubject: {
          maxMarks: 50,
          examDate: new Date("2028-05-01"),
          exam: { name: "Midterm", type: "MIDTERM", academicYear: { name: "2028" } },
          subject: { name: "Math" },
        },
        resultSubmission: { publishedAt: new Date("2028-05-10") },
      },
    ]);
    const { service } = createService(prisma);

    const result = await service.myChildResults(ACTOR, "student-1");

    expect(prisma.result.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { enrollment: { studentId: "student-1" }, resultSubmission: { status: "PUBLISHED" }, isAbsent: false } }),
    );
    expect(result[0].percentage).toBe(90);
    expect(result[0].marksObtained).toBe(45);
  });
});

describe("GuardianPortalService.myChildInvoices — Invoice + Charge merge", () => {
  let prisma: MockPrisma;
  let service: GuardianPortalService;

  beforeEach(() => {
    prisma = createMockPrisma();
    ({ service } = createService(prisma));
  });

  it("only sums POSTED payments toward paid/balance, excluding e.g. REVERSED", async () => {
    prisma.invoice.findMany.mockResolvedValue([
      {
        id: "inv-1",
        amount: "100.00",
        status: "PARTIALLY_PAID",
        dueDate: new Date("2028-02-01"),
        feeStructure: { name: "Tuition" },
        payments: [
          { id: "p1", amount: "40.00", method: "CASH", paidAt: new Date(), reference: null, status: "POSTED" },
          { id: "p2", amount: "999.00", method: "CASH", paidAt: new Date(), reference: null, status: "REVERSED" },
        ],
      },
    ]);
    prisma.charge.findMany.mockResolvedValue([]);

    const result = await service.myChildInvoices(ACTOR, "student-1");

    expect(result[0].paid).toBe(40);
    expect(result[0].balance).toBe(60);
  });

  it("labels a Charge's feeName with its billing period appended when one exists, plain feeStructure name otherwise", async () => {
    prisma.invoice.findMany.mockResolvedValue([]);
    prisma.charge.findMany.mockResolvedValue([
      { id: "c1", amount: "50.00", status: "PENDING", dueDate: new Date(), feeStructure: { name: "Bus Fee" }, billingPeriod: { name: "January" }, payments: [] },
      { id: "c2", amount: "20.00", status: "PENDING", dueDate: new Date(), feeStructure: { name: "Lab Fee" }, billingPeriod: null, payments: [] },
    ]);

    const result = await service.myChildInvoices(ACTOR, "student-1");

    expect(result[0].feeName).toBe("Bus Fee — January");
    expect(result[1].feeName).toBe("Lab Fee");
  });

  it("merges invoices and charges into one flat list, invoices first", async () => {
    prisma.invoice.findMany.mockResolvedValue([{ id: "inv-1", amount: "1.00", status: "PAID", dueDate: new Date(), feeStructure: { name: "A" }, payments: [] }]);
    prisma.charge.findMany.mockResolvedValue([{ id: "chg-1", amount: "1.00", status: "PAID", dueDate: new Date(), feeStructure: { name: "B" }, billingPeriod: null, payments: [] }]);

    const result = await service.myChildInvoices(ACTOR, "student-1");

    expect(result.map((r) => r.id)).toEqual(["inv-1", "chg-1"]);
  });
});

describe("GuardianPortalService.myAnnouncements", () => {
  let prisma: MockPrisma;
  let service: GuardianPortalService;

  beforeEach(() => {
    prisma = createMockPrisma();
    ({ service } = createService(prisma));
  });

  it("returns an empty array without querying announcements when the guardian's children have no active enrollments", async () => {
    prisma.studentGuardian.findMany.mockResolvedValue([{ student: { enrollments: [] } }]);
    const result = await service.myAnnouncements(ACTOR);
    expect(result).toEqual([]);
    expect(prisma.announcement.findMany).not.toHaveBeenCalled();
  });

  it("de-duplicates schoolIds across multiple children at the same school", async () => {
    prisma.studentGuardian.findMany.mockResolvedValue([
      { student: { enrollments: [{ schoolId: "school-1" }] } },
      { student: { enrollments: [{ schoolId: "school-1" }] } },
    ]);
    prisma.announcement.findMany.mockResolvedValue([]);

    await service.myAnnouncements(ACTOR);

    expect(prisma.announcement.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { schoolId: { in: ["school-1"] }, audience: { in: ["ALL", "PARENTS"] } } }),
    );
  });

  it("never includes a TEACHERS-only announcement", async () => {
    prisma.studentGuardian.findMany.mockResolvedValue([{ student: { enrollments: [{ schoolId: "school-1" }] } }]);
    prisma.announcement.findMany.mockResolvedValue([]);

    await service.myAnnouncements(ACTOR);

    const args = prisma.announcement.findMany.mock.calls[0][0];
    expect(args.where.audience.in).not.toContain("TEACHERS");
  });
});

describe("GuardianPortalService.myNotifications / markNotificationRead", () => {
  let prisma: MockPrisma;
  let service: GuardianPortalService;

  beforeEach(() => {
    prisma = createMockPrisma();
    ({ service } = createService(prisma));
  });

  it("myNotifications scopes to the guardian's own id", async () => {
    prisma.notification.findMany.mockResolvedValue([]);
    await service.myNotifications(ACTOR);
    expect(prisma.notification.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { guardianId: "guardian-1" } }));
  });

  it("markNotificationRead throws NotFoundException for a notification not belonging to this guardian", async () => {
    prisma.notification.findFirst.mockResolvedValue(null);
    await expect(service.markNotificationRead(ACTOR, "notif-1")).rejects.toThrow(NotFoundException);
    expect(prisma.notification.update).not.toHaveBeenCalled();
  });

  it("markNotificationRead scopes the ownership check by both id and the guardian's own id", async () => {
    prisma.notification.findFirst.mockResolvedValue({ id: "notif-1", guardianId: "guardian-1" });
    prisma.notification.update.mockResolvedValue({ id: "notif-1", isRead: true });

    await service.markNotificationRead(ACTOR, "notif-1");

    expect(prisma.notification.findFirst).toHaveBeenCalledWith({ where: { id: "notif-1", guardianId: "guardian-1" } });
    expect(prisma.notification.update).toHaveBeenCalledWith({ where: { id: "notif-1" }, data: { isRead: true } });
  });
});

describe("GuardianPortalService.myChildResultsReport — linked child only, Term 1 / Term 2 / Annual", () => {
  const row = (id: string, termId: string, marks: number, max: number) => ({
    id,
    marksObtained: marks,
    examSubject: { maxMarks: max, examDate: new Date("2028-03-01"), subject: { name: "Math" }, exam: { name: "Exam", type: "FINAL", termId } },
    resultSubmission: { publishedAt: new Date("2028-03-10") },
  });
  const enrollment = {
    id: "enr-1",
    status: "ACTIVE",
    academicYearId: "year-1",
    academicYear: { id: "year-1", name: "2028", isCurrent: true },
    school: { name: "Saamalay Primary" },
    class: { name: "Class 5" },
    section: { name: "A" },
  };

  function setup() {
    const prisma = createMockPrisma();
    prisma.studentEnrollment.findMany.mockResolvedValue([enrollment]);
    prisma.term.findMany.mockResolvedValue([
      { id: "t1", name: "Term 1", weight: 50 },
      { id: "t2", name: "Term 2", weight: 50 },
    ]);
    prisma.result.findMany.mockResolvedValue([]);
    const { service, guardians } = createService(prisma);
    return { prisma, service, guardians };
  }

  it("verifies the parent-child link BEFORE touching any result data", async () => {
    const { prisma, service, guardians } = setup();
    guardians.assertGuardianCanAccessStudent.mockRejectedValue(new NotFoundException("Student not found"));

    await expect(service.myChildResultsReport(ACTOR, "someone-elses-child")).rejects.toThrow(NotFoundException);

    expect(guardians.assertGuardianCanAccessStudent).toHaveBeenCalledWith(ACTOR, "someone-elses-child");
    expect(prisma.studentEnrollment.findMany).not.toHaveBeenCalled();
    expect(prisma.result.findMany).not.toHaveBeenCalled();
  });

  it("builds the report from exactly the requested child's id — never a mix of children", async () => {
    const { prisma, service } = setup();

    await service.myChildResultsReport(ACTOR, "child-1");

    expect(prisma.studentEnrollment.findMany.mock.calls[0][0].where).toEqual({ studentId: "child-1" });
    expect(prisma.result.findMany.mock.calls[0][0].where.enrollmentId).toEqual({ in: ["enr-1"] });
  });

  it("returns Term 1, Term 2 and the annual result with eligibility", async () => {
    const { prisma, service } = setup();
    prisma.result.findMany.mockResolvedValue([row("r1", "t1", 45, 100), row("r2", "t2", 40, 100)]);

    const report = await service.myChildResultsReport(ACTOR, "child-1");

    expect(report.terms[0]).toMatchObject({ name: "Term 1", percentage: 45 });
    expect(report.terms[1]).toMatchObject({ name: "Term 2", percentage: 40 });
    expect(report.annual).toEqual({ term1Percentage: 45, term2Percentage: 40, annualPercentage: 42.5 });
  });

  it("only asks the database for PUBLISHED results", async () => {
    const { prisma, service } = setup();

    await service.myChildResultsReport(ACTOR, "child-1");

    expect(prisma.result.findMany.mock.calls[0][0].where).toMatchObject({
      resultSubmission: { status: "PUBLISHED" },
      isAbsent: false,
    });
  });

  it("scopes to a requested historical year with {studentId, academicYearId}", async () => {
    const { prisma, service } = setup();

    await service.myChildResultsReport(ACTOR, "child-1", "year-1");

    expect(prisma.studentEnrollment.findMany.mock.calls[0][0].where).toEqual({ studentId: "child-1", academicYearId: "year-1" });
  });

  it("a year the child was never enrolled in is NotFound", async () => {
    const { prisma, service } = setup();
    prisma.studentEnrollment.findMany.mockResolvedValue([]);

    await expect(service.myChildResultsReport(ACTOR, "child-1", "not-their-year")).rejects.toThrow(NotFoundException);
    expect(prisma.result.findMany).not.toHaveBeenCalled();
  });
});

describe("GuardianPortalService.myChildAttendance — two sessions, linked child only", () => {
  const rec = (id: string, session: "MORNING" | "AFTERNOON", status: string) => ({
    id,
    date: new Date("2028-03-01"),
    session,
    status,
    note: null,
    enrollment: { class: { name: "Class 5" }, section: { name: "A" }, academicYear: { name: "2028" } },
  });

  it("verifies the parent-child link before reading attendance", async () => {
    const prisma = createMockPrisma();
    const { service, guardians } = createService(prisma);
    guardians.assertGuardianCanAccessStudent.mockRejectedValue(new NotFoundException("Student not found"));

    await expect(service.myChildAttendance(ACTOR, "someone-elses-child", "year-1")).rejects.toThrow(NotFoundException);
    expect(prisma.attendance.findMany).not.toHaveBeenCalled();
  });

  it("keeps Morning and Afternoon as separate records; a missing session is not fabricated as Absent", async () => {
    const prisma = createMockPrisma();
    prisma.attendance.findMany.mockResolvedValue([rec("a1", "MORNING", "PRESENT")]);
    const { service } = createService(prisma);

    const { summary, records } = await service.myChildAttendance(ACTOR, "child-1", "year-1");

    expect(records.map((r) => [r.session, r.status])).toEqual([["MORNING", "PRESENT"]]);
    expect(summary).toMatchObject({ total: 1, present: 1, absent: 0 });
  });
});
