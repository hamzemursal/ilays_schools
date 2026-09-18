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

  it("filters by guardianName against any active guardian's first or last name", async () => {
    const { service, prisma } = makeService();
    prisma.studentEnrollment.findMany.mockResolvedValueOnce([{ id: "enr-1" }]).mockResolvedValueOnce([enrollmentRow()]);

    await service.search(ADMIN_STUDENTS_ONLY, "school-1", { academicYearId: "year-1", guardianName: "Amina" });

    const where = prisma.studentEnrollment.findMany.mock.calls[0][0].where;
    expect(where.student.guardians.some).toEqual({
      status: "ACTIVE",
      guardian: {
        OR: [
          { firstName: { contains: "Amina", mode: "insensitive" } },
          { lastName: { contains: "Amina", mode: "insensitive" } },
        ],
      },
    });
  });

  it("filters by guardianRelationship against any active guardian link", async () => {
    const { service, prisma } = makeService();
    prisma.studentEnrollment.findMany.mockResolvedValueOnce([{ id: "enr-1" }]).mockResolvedValueOnce([enrollmentRow()]);

    await service.search(ADMIN_STUDENTS_ONLY, "school-1", { academicYearId: "year-1", guardianRelationship: "MOTHER" });

    const where = prisma.studentEnrollment.findMany.mock.calls[0][0].where;
    expect(where.student.guardians.some).toEqual({ status: "ACTIVE", relationship: "MOTHER" });
  });

  it("filters by hasGuardianContact=true using a some-clause requiring a non-blank phone", async () => {
    const { service, prisma } = makeService();
    prisma.studentEnrollment.findMany.mockResolvedValueOnce([{ id: "enr-1" }]).mockResolvedValueOnce([enrollmentRow()]);

    await service.search(ADMIN_STUDENTS_ONLY, "school-1", { academicYearId: "year-1", hasGuardianContact: true });

    const where = prisma.studentEnrollment.findMany.mock.calls[0][0].where;
    expect(where.student.guardians.some).toEqual({
      status: "ACTIVE",
      guardian: { AND: [{ phone: { not: null } }, { phone: { not: "" } }] },
    });
  });

  it("filters by hasGuardianContact=false using a none-clause, treating both null and blank phone as no contact", async () => {
    const { service, prisma } = makeService();
    prisma.studentEnrollment.findMany.mockResolvedValueOnce([{ id: "enr-1" }]).mockResolvedValueOnce([enrollmentRow()]);

    await service.search(ADMIN_STUDENTS_ONLY, "school-1", { academicYearId: "year-1", hasGuardianContact: false });

    const where = prisma.studentEnrollment.findMany.mock.calls[0][0].where;
    expect(where.student.guardians.none).toEqual({
      status: "ACTIVE",
      guardian: { AND: [{ phone: { not: null } }, { phone: { not: "" } }] },
    });
  });

  it("keeps guardian filters scoped to the requested school — schoolId is always the outer where clause", async () => {
    const { service, prisma } = makeService();
    prisma.studentEnrollment.findMany.mockResolvedValueOnce([{ id: "enr-1" }]).mockResolvedValueOnce([enrollmentRow()]);

    await service.search(ADMIN_STUDENTS_ONLY, "school-42", {
      academicYearId: "year-1",
      guardianName: "Amina",
      guardianRelationship: "MOTHER",
      hasGuardianContact: true,
    });

    const where = prisma.studentEnrollment.findMany.mock.calls[0][0].where;
    // Guardian is not itself school-scoped in the schema — isolation instead
    // comes from filtering StudentEnrollment rows (which ARE school-scoped)
    // and only ever reading the guardian relation off an already-matched,
    // in-school student. This asserts that scoping is still the outermost
    // condition even once every guardian filter is combined.
    expect(where.schoolId).toBe("school-42");
  });

  it("checks school access before running any guardian-filtered query", async () => {
    const { service, prisma, schools } = makeService();
    schools.findOneAccessibleOrThrow.mockRejectedValue(new Error("Forbidden"));

    await expect(
      service.search(ADMIN_STUDENTS_ONLY, "school-1", { academicYearId: "year-1", guardianName: "Amina" }),
    ).rejects.toThrow("Forbidden");
    expect(prisma.studentEnrollment.findMany).not.toHaveBeenCalled();
  });

  it("returns guardian data for a Primary School student with no portal account, same as any other student", async () => {
    const { service, prisma } = makeService();
    const primaryStudentRow = enrollmentRow({ startDate: new Date("2027-01-10") });
    primaryStudentRow.student.userId = null; // Primary students have no Student Portal login
    prisma.studentEnrollment.findMany
      .mockResolvedValueOnce([{ id: "enr-1" }])
      .mockResolvedValueOnce([primaryStudentRow]);

    const result = await service.search(ADMIN_STUDENTS_ONLY, "school-1", {
      academicYearId: "year-1",
      guardianRelationship: "MOTHER",
    });

    expect(result.items[0].hasPortalAccount).toBe(false);
    expect(result.items[0].guardian?.relationship).toBe("MOTHER");
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

// Regression coverage for the historical-enrollment-scoping bug: a query for
// a past academic year used to also require status: "ACTIVE", which is never
// true for a year the student has since been promoted/retained out of — this
// simulates a real two-row dataset (one closed historical row, one current
// row for the same student) and applies the actual `where` clause the
// service builds against it, the same way Postgres would, so the test fails
// against the old (buggy) query shape and passes against the fixed one.
describe("StudentDirectoryService — historical Academic Year scoping (regression)", () => {
  const HISTORICAL_ROW = {
    id: "enr-2025",
    studentId: "student-1",
    studentNumber: "STU-1",
    rollNumber: 5,
    classId: "class-form1",
    sectionId: "section-a",
    academicYearId: "year-2025",
    status: "PROMOTED", // closed once the student moved on to 2026-2027
    startDate: new Date("2025-01-01"),
    class: { name: "Form 1" },
    section: { name: "A" },
    student: {
      id: "student-1",
      firstName: "Hodan",
      lastName: "Ali",
      sex: "FEMALE",
      currentStatus: "ACTIVE",
      dateOfBirth: new Date("2015-05-01"),
      userId: null,
      guardians: [],
    },
  };
  const CURRENT_ROW = {
    ...HISTORICAL_ROW,
    id: "enr-2026",
    rollNumber: 12,
    classId: "class-form2",
    sectionId: "section-b",
    academicYearId: "year-2026",
    status: "ACTIVE",
    startDate: new Date("2026-01-01"),
    class: { name: "Form 2" },
    section: { name: "B" },
  };

  function makeTwoYearService() {
    const { service, prisma } = makeService();
    const rows = [HISTORICAL_ROW, CURRENT_ROW];
    prisma.studentEnrollment.findMany.mockImplementation((args: { where: { academicYearId?: string; status?: string; id?: { in: string[] } }; select?: unknown }) => {
      if (args.select) {
        // The "candidate ids" pass — replicate Prisma's real AND semantics:
        // an explicit status filter must actually match, an absent one
        // matches everything.
        const matches = rows.filter(
          (r) => r.academicYearId === args.where.academicYearId && (args.where.status === undefined || r.status === args.where.status),
        );
        return Promise.resolve(matches.map((r) => ({ id: r.id })));
      }
      // The "full row detail" pass, keyed by id.
      const ids = args.where.id!.in;
      return Promise.resolve(rows.filter((r) => ids.includes(r.id)));
    });
    return { service, prisma };
  }

  it("Test A: a student's 2025–2026 enrollment appears when querying Academic Year 2025–2026", async () => {
    const { service } = makeTwoYearService();

    const result = await service.search(ADMIN_STUDENTS_ONLY, "school-1", { academicYearId: "year-2025" });

    expect(result.total).toBe(1);
    expect(result.items[0]).toMatchObject({ enrollmentId: "enr-2025", className: "Form 1", sectionName: "A", rollNumber: 5 });
  });

  it("Test B: the same student's 2026–2027 enrollment appears when querying Academic Year 2026–2027", async () => {
    const { service } = makeTwoYearService();

    const result = await service.search(ADMIN_STUDENTS_ONLY, "school-1", { academicYearId: "year-2026" });

    expect(result.total).toBe(1);
    expect(result.items[0]).toMatchObject({ enrollmentId: "enr-2026", className: "Form 2", sectionName: "B", rollNumber: 12 });
  });

  it("Test C: the 2025–2026 query never uses the student's current (2026–2027) enrollment — no status filter narrows it to only-ACTIVE rows", async () => {
    const { service, prisma } = makeTwoYearService();

    const result = await service.search(ADMIN_STUDENTS_ONLY, "school-1", { academicYearId: "year-2025" });

    expect(result.items[0].enrollmentId).not.toBe("enr-2026");
    expect(result.items[0].classId).not.toBe("class-form2");
    const candidateCall = prisma.studentEnrollment.findMany.mock.calls.find((c) => c[0].select);
    expect(candidateCall![0].where).not.toHaveProperty("status");
  });

  it("Test F: ordinary current-year search behavior is unchanged — a single active enrollment still returns for its own year", async () => {
    const { service, prisma } = makeService();
    prisma.studentEnrollment.findMany.mockResolvedValueOnce([{ id: "enr-1" }]).mockResolvedValueOnce([enrollmentRow()]);

    const result = await service.search(ADMIN_STUDENTS_ONLY, "school-1", { academicYearId: "year-1" });

    expect(result.total).toBe(1);
    expect(result.items[0].enrollmentId).toBe("enr-1");
    const candidateWhere = prisma.studentEnrollment.findMany.mock.calls[0][0].where;
    expect(candidateWhere.academicYearId).toBe("year-1");
    expect(candidateWhere.schoolId).toBe("school-1");
  });
});
