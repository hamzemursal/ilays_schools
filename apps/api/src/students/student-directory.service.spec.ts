import type { AuthenticatedUser } from "../auth/types/authenticated-user";
import { StudentDirectoryService } from "./student-directory.service";
import type { PrismaService } from "../prisma/prisma.service";
import type { SchoolsService } from "../schools/schools.service";
import type { AttendanceService } from "../attendance/attendance.service";
import type { StudentLedgerService } from "../finance/student-ledger.service";

const ADMIN_WITH_ALL: AuthenticatedUser = {
  id: "admin-1",
  email: "admin@example.com",
  organizationId: "org-1",
  roles: ["SCHOOL_ADMIN"],
  permissions: ["students.view", "attendance.view", "finance.ledger.view"],
  schoolIds: ["school-1"],
};

const ADMIN_STUDENTS_ONLY: AuthenticatedUser = {
  ...ADMIN_WITH_ALL,
  id: "admin-2",
  permissions: ["students.view"],
};

function enrollmentRow(overrides: Partial<{ id: string; studentId: string; studentNumber: string; rollNumber: number; classId: string; sectionId: string; academicYearId: string; startDate: Date }> = {}) {
  return {
    id: "enr-1",
    studentId: "stu-1",
    studentNumber: "STU-2027-00001",
    rollNumber: 1,
    classId: "class-1",
    sectionId: "section-a",
    academicYearId: "year-1",
    startDate: new Date("2027-01-01"),
    class: { name: "Class 1" },
    section: { name: "A" },
    student: {
      id: "stu-1",
      firstName: "Hodan",
      lastName: "Ali",
      sex: "FEMALE",
      currentStatus: "ACTIVE",
      dateOfBirth: new Date("2015-05-01"),
      userId: null,
      guardians: [
        {
          isPrimaryContact: true,
          relationship: "MOTHER",
          guardian: { id: "guardian-1", firstName: "Amina", lastName: "Ali", phone: "0611111111", email: null, address: null },
        },
      ],
    },
    ...overrides,
  };
}

function makeService() {
  const prisma = {
    studentEnrollment: { findMany: jest.fn() },
  };
  const schools = { findOneAccessibleOrThrow: jest.fn().mockResolvedValue(undefined) };
  const attendance = { getTodayStatusForEnrollments: jest.fn().mockResolvedValue(new Map()) };
  const ledger = { getSummaryForEnrollments: jest.fn().mockResolvedValue(new Map()) };

  const service = new StudentDirectoryService(
    prisma as unknown as PrismaService,
    schools as unknown as SchoolsService,
    attendance as unknown as AttendanceService,
    ledger as unknown as StudentLedgerService,
  );
  return { service, prisma, schools, attendance, ledger };
}

describe("StudentDirectoryService — access and required params", () => {
  it("checks school access before anything else", async () => {
    const { service, prisma, schools } = makeService();
    prisma.studentEnrollment.findMany.mockResolvedValue([]);
    await service.search(ADMIN_WITH_ALL, "school-1", { academicYearId: "year-1" });
    expect(schools.findOneAccessibleOrThrow).toHaveBeenCalledWith(ADMIN_WITH_ALL, "school-1");
  });

  it("rejects a request with no academicYearId", async () => {
    const { service } = makeService();
    await expect(service.search(ADMIN_WITH_ALL, "school-1", { academicYearId: "" })).rejects.toThrow(
      "academicYearId is required",
    );
  });
});

describe("StudentDirectoryService — basic row shape", () => {
  it("returns the primary guardian and guardian count from real StudentGuardian data", async () => {
    const { service, prisma } = makeService();
    prisma.studentEnrollment.findMany
      .mockResolvedValueOnce([{ id: "enr-1" }]) // id-only candidate pass
      .mockResolvedValueOnce([enrollmentRow()]); // full-detail pass

    const result = await service.search(ADMIN_STUDENTS_ONLY, "school-1", { academicYearId: "year-1" });

    expect(result.total).toBe(1);
    expect(result.items[0].guardian).toEqual({
      id: "guardian-1",
      name: "Amina Ali",
      relationship: "MOTHER",
      isPrimaryContact: true,
      phone: "0611111111",
      email: null,
      address: null,
    });
    expect(result.items[0].guardianCount).toBe(1);
  });

  it("uses the current enrollment's startDate as Admission Date — Student has no separate field for it", async () => {
    const { service, prisma } = makeService();
    prisma.studentEnrollment.findMany
      .mockResolvedValueOnce([{ id: "enr-1" }])
      .mockResolvedValueOnce([enrollmentRow({ startDate: new Date("2026-01-15") })]);

    const result = await service.search(ADMIN_STUDENTS_ONLY, "school-1", { academicYearId: "year-1" });
    expect(result.items[0].admissionDate).toEqual(new Date("2026-01-15"));
  });

  it("reports hasPortalAccount from the student's real userId", async () => {
    const { service, prisma } = makeService();
    const row = enrollmentRow();
    prisma.studentEnrollment.findMany
      .mockResolvedValueOnce([{ id: "enr-1" }])
      .mockResolvedValueOnce([{ ...row, student: { ...row.student, userId: "user-9" } }]);

    const result = await service.search(ADMIN_STUDENTS_ONLY, "school-1", { academicYearId: "year-1" });
    expect(result.items[0].hasPortalAccount).toBe(true);
  });
});

describe("StudentDirectoryService — permission-gated enrichment", () => {
  it("never calls attendance or finance bulk queries for an actor without those permissions", async () => {
    const { service, prisma, attendance, ledger } = makeService();
    prisma.studentEnrollment.findMany.mockResolvedValueOnce([{ id: "enr-1" }]).mockResolvedValueOnce([enrollmentRow()]);

    const result = await service.search(ADMIN_STUDENTS_ONLY, "school-1", { academicYearId: "year-1" });

    expect(attendance.getTodayStatusForEnrollments).not.toHaveBeenCalled();
    expect(ledger.getSummaryForEnrollments).not.toHaveBeenCalled();
    expect(result.items[0].attendanceToday).toBeNull();
    expect(result.items[0].finance).toBeNull();
  });

  it("includes attendance and finance data for an actor who holds both permissions", async () => {
    const { service, prisma, attendance, ledger } = makeService();
    prisma.studentEnrollment.findMany.mockResolvedValueOnce([{ id: "enr-1" }]).mockResolvedValueOnce([enrollmentRow()]);
    attendance.getTodayStatusForEnrollments.mockResolvedValue(new Map([["enr-1", { MORNING: "PRESENT", AFTERNOON: null }]]));
    ledger.getSummaryForEnrollments.mockResolvedValue(
      new Map([["enr-1", { totalCharged: 100, totalPaid: 100, balance: 0, feeStatus: "PAID", lastPaymentDate: null }]]),
    );

    const result = await service.search(ADMIN_WITH_ALL, "school-1", { academicYearId: "year-1" });

    expect(result.items[0].attendanceToday).toEqual({ MORNING: "PRESENT", AFTERNOON: null });
    expect(result.items[0].finance?.feeStatus).toBe("PAID");
  });

  it("never treats an unrecorded (null) session as Absent", async () => {
    const { service, prisma, attendance } = makeService();
    prisma.studentEnrollment.findMany.mockResolvedValueOnce([{ id: "enr-1" }]).mockResolvedValueOnce([enrollmentRow()]);
    attendance.getTodayStatusForEnrollments.mockResolvedValue(new Map([["enr-1", { MORNING: null, AFTERNOON: null }]]));

    const result = await service.search(ADMIN_WITH_ALL, "school-1", { academicYearId: "year-1" });
    expect(result.items[0].attendanceToday!.MORNING).toBeNull();
    expect(result.items[0].attendanceToday!.MORNING).not.toBe("ABSENT");
  });
});

describe("StudentDirectoryService — derived filters", () => {
  it("filters by feeStatus using the bulk ledger summary, not a second calculation system", async () => {
    const { service, prisma, ledger } = makeService();
    prisma.studentEnrollment.findMany
      .mockResolvedValueOnce([{ id: "enr-1" }, { id: "enr-2" }]) // candidates
      .mockResolvedValueOnce([enrollmentRow({ id: "enr-2", studentId: "stu-2" })]); // only enr-2 survives the filter
    ledger.getSummaryForEnrollments.mockResolvedValue(
      new Map([
        ["enr-1", { totalCharged: 100, totalPaid: 100, balance: 0, feeStatus: "PAID", lastPaymentDate: null }],
        ["enr-2", { totalCharged: 100, totalPaid: 0, balance: 100, feeStatus: "PENDING", lastPaymentDate: null }],
      ]),
    );

    const result = await service.search(ADMIN_WITH_ALL, "school-1", { academicYearId: "year-1", feeStatus: "PENDING" });

    expect(result.total).toBe(1);
    expect(ledger.getSummaryForEnrollments).toHaveBeenCalledWith(["enr-1", "enr-2"]);
  });

  it("filters by attendanceStatus NOT_RECORDED without ever matching a real ABSENT record", async () => {
    const { service, prisma, attendance } = makeService();
    prisma.studentEnrollment.findMany
      .mockResolvedValueOnce([{ id: "enr-1" }, { id: "enr-2" }])
      .mockResolvedValueOnce([enrollmentRow({ id: "enr-2", studentId: "stu-2" })]);
    attendance.getTodayStatusForEnrollments.mockResolvedValue(
      new Map([
        ["enr-1", { MORNING: "ABSENT", AFTERNOON: null }],
        ["enr-2", { MORNING: null, AFTERNOON: null }],
      ]),
    );

    const result = await service.search(ADMIN_WITH_ALL, "school-1", {
      academicYearId: "year-1",
      attendanceStatus: "NOT_RECORDED",
    });

    expect(result.total).toBe(1);
  });

  it("computes summary counts over the WHOLE filtered set, not just one page", async () => {
    const { service, prisma, attendance, ledger } = makeService();
    prisma.studentEnrollment.findMany
      .mockResolvedValueOnce([{ id: "enr-1" }, { id: "enr-2" }, { id: "enr-3" }]) // candidates
      .mockResolvedValueOnce([
        { id: "enr-1", student: { currentStatus: "ACTIVE" } },
        { id: "enr-2", student: { currentStatus: "ACTIVE" } },
        { id: "enr-3", student: { currentStatus: "WITHDRAWN" } },
      ]);
    attendance.getTodayStatusForEnrollments.mockResolvedValue(
      new Map([
        ["enr-1", { MORNING: "PRESENT", AFTERNOON: null }],
        ["enr-2", { MORNING: "ABSENT", AFTERNOON: null }],
        ["enr-3", { MORNING: null, AFTERNOON: null }],
      ]),
    );
    ledger.getSummaryForEnrollments.mockResolvedValue(
      new Map([
        ["enr-1", { totalCharged: 100, totalPaid: 100, balance: 0, feeStatus: "PAID", lastPaymentDate: null }],
        ["enr-2", { totalCharged: 100, totalPaid: 0, balance: 100, feeStatus: "PENDING", lastPaymentDate: null }],
        ["enr-3", { totalCharged: 0, totalPaid: 0, balance: 0, feeStatus: "NO_CHARGE", lastPaymentDate: null }],
      ]),
    );

    const result = await service.summary(ADMIN_WITH_ALL, "school-1", { academicYearId: "year-1" });

    expect(result).toEqual({ total: 3, active: 2, presentToday: 1, outstandingBalances: 1 });
  });

  it("returns null attendance/finance summary fields for an actor without those permissions", async () => {
    const { service, prisma } = makeService();
    prisma.studentEnrollment.findMany
      .mockResolvedValueOnce([{ id: "enr-1" }])
      .mockResolvedValueOnce([{ id: "enr-1", student: { currentStatus: "ACTIVE" } }]);

    const result = await service.summary(ADMIN_STUDENTS_ONLY, "school-1", { academicYearId: "year-1" });
    expect(result).toEqual({ total: 1, active: 1, presentToday: null, outstandingBalances: null });
  });

  it("returns a zeroed summary for an empty filtered set, without querying student status", async () => {
    const { service, prisma } = makeService();
    prisma.studentEnrollment.findMany.mockResolvedValueOnce([]);

    const result = await service.summary(ADMIN_WITH_ALL, "school-1", { academicYearId: "year-1" });
    expect(result).toEqual({ total: 0, active: 0, presentToday: 0, outstandingBalances: 0 });
    expect(prisma.studentEnrollment.findMany).toHaveBeenCalledTimes(1);
  });

  it("paginates the filtered id list, not the unfiltered candidate list", async () => {
    const { service, prisma } = makeService();
    const candidateIds = Array.from({ length: 30 }, (_, i) => ({ id: `enr-${i}` }));
    prisma.studentEnrollment.findMany.mockResolvedValueOnce(candidateIds).mockResolvedValueOnce(
      Array.from({ length: 5 }, (_, i) => enrollmentRow({ id: `enr-${i}`, studentId: `stu-${i}` })),
    );

    const result = await service.search(ADMIN_STUDENTS_ONLY, "school-1", { academicYearId: "year-1", page: 1, pageSize: 5 });

    expect(result.total).toBe(30);
    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(5);
    expect(result.items).toHaveLength(5);
  });
});
