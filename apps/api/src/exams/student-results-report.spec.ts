import { NotFoundException } from "@nestjs/common";
import type { PrismaService } from "../prisma/prisma.service";
import { buildStudentResultsReport } from "./student-results-report";
import { combineTermPercentages, percentageFromMarks } from "./result-calculation";

type MockPrisma = {
  studentEnrollment: { findMany: jest.Mock };
  term: { findMany: jest.Mock };
  result: { findMany: jest.Mock };
};

function createMockPrisma(): MockPrisma {
  return {
    studentEnrollment: { findMany: jest.fn() },
    term: { findMany: jest.fn() },
    result: { findMany: jest.fn() },
  };
}

const asPrisma = (p: MockPrisma) => p as unknown as PrismaService;

function enrollment(overrides: Record<string, unknown> = {}) {
  return {
    id: "enr-2027",
    status: "ACTIVE",
    academicYearId: "year-2027",
    academicYear: { id: "year-2027", name: "2027", isCurrent: true },
    school: { name: "Saamalay Secondary" },
    class: { name: "Form 1" },
    section: { name: "A" },
    ...overrides,
  };
}

const TERMS = [
  { id: "term-1", name: "Term 1", weight: 50 },
  { id: "term-2", name: "Term 2", weight: 50 },
];

function result(id: string, termId: string | null, subject: string, marks: number, max: number, exam = "Midterm") {
  return {
    id,
    marksObtained: marks,
    examSubject: {
      maxMarks: max,
      examDate: new Date("2027-03-01"),
      subject: { name: subject },
      exam: { name: exam, type: "MIDTERM", termId },
    },
    resultSubmission: { publishedAt: new Date("2027-03-10") },
  };
}

describe("buildStudentResultsReport", () => {
  let prisma: MockPrisma;

  beforeEach(() => {
    prisma = createMockPrisma();
    prisma.studentEnrollment.findMany.mockResolvedValue([enrollment()]);
    prisma.term.findMany.mockResolvedValue(TERMS);
    prisma.result.findMany.mockResolvedValue([]);
  });

  describe("published-only, real marks only", () => {
    it("queries only PUBLISHED, non-absent results", async () => {
      await buildStudentResultsReport(asPrisma(prisma), "student-1");

      expect(prisma.result.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            resultSubmission: { status: "PUBLISHED" },
            isAbsent: false,
          }),
        }),
      );
    });

    it("scopes the results query to the student's enrollment(s) in the resolved year — never to the student id alone", async () => {
      await buildStudentResultsReport(asPrisma(prisma), "student-1");

      const where = prisma.result.findMany.mock.calls[0][0].where;
      expect(where.enrollmentId).toEqual({ in: ["enr-2027"] });
      expect(where.enrollment).toBeUndefined();
    });

    it("never turns a null mark into a 0 row", async () => {
      prisma.result.findMany.mockResolvedValue([{ ...result("r1", "term-1", "Math", 0, 100), marksObtained: null }]);

      const report = await buildStudentResultsReport(asPrisma(prisma), "student-1");

      expect(report.terms[0].results).toEqual([]);
      expect(report.terms[0].percentage).toBeNull();
    });
  });

  describe("Term 1 / Term 2 grouping", () => {
    it("groups results under the two existing terms with marks, max marks and per-row percentage", async () => {
      prisma.result.findMany.mockResolvedValue([
        result("r1", "term-1", "Math", 90, 100),
        result("r2", "term-1", "English", 10, 50),
        result("r3", "term-2", "Math", 70, 100),
      ]);

      const report = await buildStudentResultsReport(asPrisma(prisma), "student-1");

      expect(report.terms.map((t) => t.name)).toEqual(["Term 1", "Term 2"]);
      const [t1, t2] = report.terms;
      expect(t1.results.map((r) => [r.subjectName, r.marksObtained, r.maxMarks, r.percentage])).toEqual([
        ["English", 10, 50, 20],
        ["Math", 90, 100, 90],
      ]);
      expect(t2.results.map((r) => [r.subjectName, r.marksObtained, r.maxMarks, r.percentage])).toEqual([["Math", 70, 100, 70]]);
    });

    it("term average is SUM(marks)/SUM(max), not an average of per-subject percentages", async () => {
      prisma.result.findMany.mockResolvedValue([
        result("r1", "term-1", "Math", 90, 100),
        result("r2", "term-1", "English", 10, 50),
      ]);

      const report = await buildStudentResultsReport(asPrisma(prisma), "student-1");

      // (90+10)/(100+50) = 66.67; a mean of 90% and 20% would be 55.
      expect(report.terms[0].percentage).toBe(66.67);
    });

    it("a term with no published results is Incomplete (null) — never 0", async () => {
      prisma.result.findMany.mockResolvedValue([result("r1", "term-1", "Math", 80, 100)]);

      const report = await buildStudentResultsReport(asPrisma(prisma), "student-1");

      expect(report.terms[1].percentage).toBeNull();
      expect(report.terms[1].results).toEqual([]);
    });

    it("always returns exactly Term 1 and Term 2 — Exam Type never creates a third term", async () => {
      prisma.result.findMany.mockResolvedValue([
        result("r1", "term-1", "Math", 80, 100, "Final Exam"),
        result("r2", "term-2", "Math", 60, 100, "Midterm Exam"),
      ]);

      const report = await buildStudentResultsReport(asPrisma(prisma), "student-1");

      expect(report.terms).toHaveLength(2);
      expect(report.otherResults).toEqual([]);
    });

    it("keeps published results of a term-less exam visible but out of every average", async () => {
      prisma.result.findMany.mockResolvedValue([
        result("r1", "term-1", "Math", 80, 100),
        result("r2", null, "Math", 10, 100, "Quiz"),
      ]);

      const report = await buildStudentResultsReport(asPrisma(prisma), "student-1");

      expect(report.otherResults.map((r) => r.id)).toEqual(["r2"]);
      expect(report.terms[0].percentage).toBe(80);
    });
  });

  describe("annual / combined result (Phase 1 calculation)", () => {
    it("combines the two terms with the year's own weights and reports eligibility", async () => {
      prisma.term.findMany.mockResolvedValue([
        { id: "term-1", name: "Term 1", weight: 40 },
        { id: "term-2", name: "Term 2", weight: 60 },
      ]);
      prisma.result.findMany.mockResolvedValue([
        result("r1", "term-1", "Math", 80, 100),
        result("r2", "term-2", "Math", 50, 100),
      ]);

      const { annual } = await buildStudentResultsReport(asPrisma(prisma), "student-1");

      expect(annual).toEqual({ term1Percentage: 80, term2Percentage: 50, annualPercentage: 62 });
    });

    it("never sends promotion eligibility or a pass mark to a student or parent — at any percentage", async () => {
      for (const [t1, t2] of [[50, 50], [49, 50], [90, 95], [10, 5]]) {
        prisma.result.findMany.mockResolvedValue([
          result("r1", "term-1", "Math", t1, 100),
          result("r2", "term-2", "Math", t2, 100),
        ]);
        const report = await buildStudentResultsReport(asPrisma(prisma), "student-1");

        expect(JSON.stringify(report)).not.toMatch(/eligib|passMark|promotion/i);
        expect(Object.keys(report.annual).sort()).toEqual(["annualPercentage", "term1Percentage", "term2Percentage"]);
      }
    });

    it("the combined result is a plain weighted number either side of 50 — 50.00 and 49.50 are both just numbers", async () => {
      prisma.result.findMany.mockResolvedValue([
        result("r1", "term-1", "Math", 50, 100),
        result("r2", "term-2", "Math", 50, 100),
      ]);
      expect((await buildStudentResultsReport(asPrisma(prisma), "student-1")).annual.annualPercentage).toBe(50);

      prisma.result.findMany.mockResolvedValue([
        result("r1", "term-1", "Math", 49, 100),
        result("r2", "term-2", "Math", 50, 100),
      ]);
      const below = (await buildStudentResultsReport(asPrisma(prisma), "student-1")).annual;
      expect(below.annualPercentage).toBe(49.5);
    });

    it("Term 2 not yet published: annual and eligibility stay undetermined — never a failing 0", async () => {
      prisma.result.findMany.mockResolvedValue([result("r1", "term-1", "Math", 69, 100)]);

      const { annual } = await buildStudentResultsReport(asPrisma(prisma), "student-1");

      expect(annual).toEqual({ term1Percentage: 69, term2Percentage: null, annualPercentage: null });
    });

    it("no Term rows configured for the year: everything is undetermined", async () => {
      prisma.term.findMany.mockResolvedValue([]);
      prisma.result.findMany.mockResolvedValue([result("r1", null, "Math", 90, 100)]);

      const report = await buildStudentResultsReport(asPrisma(prisma), "student-1");

      expect(report.terms.map((t) => t.termId)).toEqual([null, null]);
      expect(report.annual).toEqual({ term1Percentage: null, term2Percentage: null, annualPercentage: null });
      expect(report.otherResults).toHaveLength(1);
    });

    it("agrees with the shared Phase 1 helpers used by promotion", () => {
      expect(percentageFromMarks([{ marksObtained: 90, maxMarks: 100 }, { marksObtained: 10, maxMarks: 50 }])).toBe(66.67);
      expect(combineTermPercentages(84, 78, 50, 50)).toEqual({ annualPercentage: 81, eligible: true });
      expect(combineTermPercentages(84, null, 50, 50)).toEqual({ annualPercentage: null, eligible: null });
    });
  });

  describe("academic-year isolation", () => {
    it("with no year given, resolves the year of the ACTIVE enrollment and looks up ALL the student's enrollments", async () => {
      prisma.studentEnrollment.findMany.mockResolvedValue([
        enrollment({ id: "enr-2027", status: "ACTIVE", academicYearId: "year-2027" }),
        enrollment({
          id: "enr-2026",
          status: "PROMOTED",
          academicYearId: "year-2026",
          academicYear: { id: "year-2026", name: "2026", isCurrent: false },
        }),
      ]);

      const report = await buildStudentResultsReport(asPrisma(prisma), "student-1");

      expect(prisma.studentEnrollment.findMany.mock.calls[0][0].where).toEqual({ studentId: "student-1" });
      expect(report.academicYear).toEqual({ id: "year-2027", name: "2027", isCurrent: true });
      expect(prisma.result.findMany.mock.calls[0][0].where.enrollmentId).toEqual({ in: ["enr-2027"] });
      expect(prisma.term.findMany).toHaveBeenCalledWith({ where: { academicYearId: "year-2027" } });
    });

    it("a historical year is resolved from THAT year's own enrollment even though it is PROMOTED, not ACTIVE", async () => {
      prisma.studentEnrollment.findMany.mockResolvedValue([
        enrollment({
          id: "enr-2026",
          status: "PROMOTED",
          academicYearId: "year-2026",
          academicYear: { id: "year-2026", name: "2026", isCurrent: false },
        }),
      ]);

      const report = await buildStudentResultsReport(asPrisma(prisma), "student-1", "year-2026");

      // {studentId, academicYearId} — never combined with status: "ACTIVE".
      expect(prisma.studentEnrollment.findMany.mock.calls[0][0].where).toEqual({ studentId: "student-1", academicYearId: "year-2026" });
      expect(report.academicYear.id).toBe("year-2026");
      expect(prisma.result.findMany.mock.calls[0][0].where.enrollmentId).toEqual({ in: ["enr-2026"] });
      expect(prisma.term.findMany).toHaveBeenCalledWith({ where: { academicYearId: "year-2026" } });
    });

    it("a year the student was never enrolled in is NotFound, and no result or term query is issued", async () => {
      prisma.studentEnrollment.findMany.mockResolvedValue([]);

      await expect(buildStudentResultsReport(asPrisma(prisma), "student-1", "someone-elses-year")).rejects.toThrow(NotFoundException);
      expect(prisma.result.findMany).not.toHaveBeenCalled();
      expect(prisma.term.findMany).not.toHaveBeenCalled();
    });

    it("a student with no enrollment at all is NotFound", async () => {
      prisma.studentEnrollment.findMany.mockResolvedValue([]);

      await expect(buildStudentResultsReport(asPrisma(prisma), "student-1")).rejects.toThrow(NotFoundException);
    });
  });
});
