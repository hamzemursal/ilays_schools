import { Suspense } from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, render, screen } from "@testing-library/react";
import type { MyResultsReport, StudentDetail } from "@/lib/api";
import StudentResultsDetailPage from "./page";

// This page is the dedicated destination for the Academic History tab's
// "View Results" link (see AcademicHistoryTimeline.spec.tsx for the link
// itself) — it renders NOTHING inline on the profile page anymore. It reuses
// the exact same StudentsService.getResultsReport data the inline version
// used, and the exact same ResultsSummary/TermCard components the Student/
// Parent Portal results pages already use — never a second calculation path.

vi.mock("next/navigation", () => ({}));
vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}));

const { ApiError } = vi.hoisted(() => {
  class ApiError extends Error {
    status: number;
    constructor(message: string, status = 400) {
      super(message);
      this.status = status;
    }
  }
  return { ApiError };
});
const authMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth-context", () => ({ useAuth: () => authMock(), ApiError }));

const apiMock = vi.hoisted(() => ({
  getStudent: vi.fn(),
  getStudentResultsReport: vi.fn(),
}));
vi.mock("@/lib/api", () => ({ api: apiMock }));

function student(overrides: Partial<StudentDetail> = {}): StudentDetail {
  return {
    id: "stu-1",
    organizationId: "org-1",
    userId: null,
    firstName: "Ahmed",
    lastName: "Mohamed",
    dateOfBirth: "2013-05-01",
    sex: "MALE",
    legacyStudentNumber: null,
    currentStatus: "ACTIVE",
    enrollments: [
      {
        id: "enr-2026",
        studentNumber: "STU-2026-00007",
        rollNumber: 5,
        status: "PROMOTED",
        startDate: "2026-01-01",
        endDate: "2026-12-31",
        school: { id: "school-1", name: "Saamalay Secondary" },
        academicYear: { id: "year-2026", name: "2026", isCurrent: false },
        class: { id: "class-form2", name: "Form 2" },
        section: { id: "section-b", name: "B" },
      },
    ],
    guardians: [],
    transfers: [],
    ...overrides,
  };
}

function emptyTerm(name: "Term 1" | "Term 2"): MyResultsReport["terms"][number] {
  return { name, termId: `t-${name}`, weight: 50, results: [], percentage: null };
}

function report(overrides: Partial<MyResultsReport> = {}): MyResultsReport {
  return {
    academicYear: { id: "year-2026", name: "2026", isCurrent: false },
    enrollment: { schoolName: "Saamalay Secondary", className: "Form 2", sectionName: "B" },
    terms: [emptyTerm("Term 1"), emptyTerm("Term 2")],
    otherResults: [],
    annual: { term1Percentage: null, term2Percentage: null, annualPercentage: null },
    ...overrides,
  };
}

async function renderPage(academicYearId = "year-2026") {
  const params = Promise.resolve({ id: "school-1", studentId: "stu-1", academicYearId });
  let result!: ReturnType<typeof render>;
  await act(async () => {
    result = render(
      <Suspense fallback={null}>
        <StudentResultsDetailPage params={params} />
      </Suspense>,
    );
  });
  return result;
}

beforeEach(() => {
  vi.clearAllMocks();
  authMock.mockReturnValue({ accessToken: "token-1", user: { permissions: ["students.view"] } });
});

describe("StudentResultsDetailPage — published year", () => {
  it("renders the page for a published academic year", async () => {
    apiMock.getStudent.mockResolvedValue(student());
    apiMock.getStudentResultsReport.mockResolvedValue(
      report({
        terms: [
          { name: "Term 1", termId: "t1", weight: 50, results: [{ id: "r1", examName: "Midterm", subjectName: "Mathematics", marksObtained: 78, maxMarks: 100, percentage: 78, examDate: null, publishedDate: null }], percentage: 78 },
          { name: "Term 2", termId: "t2", weight: 50, results: [{ id: "r2", examName: "Final", subjectName: "Mathematics", marksObtained: 82, maxMarks: 100, percentage: 82, examDate: null, publishedDate: null }], percentage: 82 },
        ],
        annual: { term1Percentage: 78, term2Percentage: 82, annualPercentage: 80 },
      }),
    );
    await renderPage();
    // "Published" (the status badge) vs the ResultsTable's own "Published"
    // column header — both real, so assert the badge specifically.
    expect(await screen.findByText("Published", { selector: "span" })).toBeInTheDocument();
  });

  it("shows the correct student identity", async () => {
    apiMock.getStudent.mockResolvedValue(student());
    apiMock.getStudentResultsReport.mockResolvedValue(report());
    await renderPage();
    // Appears both in the breadcrumb and the identity card — both real.
    expect((await screen.findAllByText("Ahmed Mohamed")).length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("Student No: STU-2026-00007")).toBeInTheDocument();
  });

  it("shows the correct academic year", async () => {
    apiMock.getStudent.mockResolvedValue(student());
    apiMock.getStudentResultsReport.mockResolvedValue(report());
    await renderPage();
    expect(await screen.findByText(/2026 · Form 2 · Section B/)).toBeInTheDocument();
  });

  it("shows the correct class/form and section", async () => {
    apiMock.getStudent.mockResolvedValue(student());
    apiMock.getStudentResultsReport.mockResolvedValue(report());
    await renderPage();
    expect(await screen.findByText(/Form 2 · Section B/)).toBeInTheDocument();
  });

  it("renders Term 1 results", async () => {
    apiMock.getStudent.mockResolvedValue(student());
    apiMock.getStudentResultsReport.mockResolvedValue(
      report({
        terms: [
          { name: "Term 1", termId: "t1", weight: 50, results: [{ id: "r1", examName: "Midterm", subjectName: "Mathematics", marksObtained: 78, maxMarks: 100, percentage: 78, examDate: null, publishedDate: null }], percentage: 78 },
          emptyTerm("Term 2"),
        ],
      }),
    );
    await renderPage();
    expect(await screen.findByText("Term 1")).toBeInTheDocument();
    expect(screen.getByText("Mathematics")).toBeInTheDocument();
    expect(screen.getByText("78 / 100")).toBeInTheDocument();
  });

  it("renders Term 2 results", async () => {
    apiMock.getStudent.mockResolvedValue(student());
    apiMock.getStudentResultsReport.mockResolvedValue(
      report({
        terms: [
          emptyTerm("Term 1"),
          { name: "Term 2", termId: "t2", weight: 50, results: [{ id: "r2", examName: "Final", subjectName: "English", marksObtained: 65, maxMarks: 100, percentage: 65, examDate: null, publishedDate: null }], percentage: 65 },
        ],
      }),
    );
    await renderPage();
    expect(await screen.findByText("Term 2")).toBeInTheDocument();
    expect(screen.getByText("English")).toBeInTheDocument();
    expect(screen.getByText("65 / 100")).toBeInTheDocument();
  });

  it("renders the Overall/Annual average", async () => {
    apiMock.getStudent.mockResolvedValue(student());
    apiMock.getStudentResultsReport.mockResolvedValue(
      report({
        terms: [
          { name: "Term 1", termId: "t1", weight: 50, results: [{ id: "r1", examName: "M", subjectName: "Math", marksObtained: 78, maxMarks: 100, percentage: 78, examDate: null, publishedDate: null }], percentage: 78 },
          { name: "Term 2", termId: "t2", weight: 50, results: [{ id: "r2", examName: "F", subjectName: "Math", marksObtained: 82, maxMarks: 100, percentage: 82, examDate: null, publishedDate: null }], percentage: 82 },
        ],
        annual: { term1Percentage: 78, term2Percentage: 82, annualPercentage: 80 },
      }),
    );
    await renderPage();
    expect(await screen.findByText("Annual / Combined Result")).toBeInTheDocument();
    expect(screen.getByText("80.00%")).toBeInTheDocument();
  });
});

describe("StudentResultsDetailPage — unpublished year", () => {
  it("shows the empty state for an unpublished academic year", async () => {
    apiMock.getStudent.mockResolvedValue(student());
    apiMock.getStudentResultsReport.mockResolvedValue(report());
    await renderPage();
    expect(await screen.findByText("Results not published yet")).toBeInTheDocument();
    expect(screen.getByText("No results have been published for this academic year yet.")).toBeInTheDocument();
    expect(screen.getByText("Not Published")).toBeInTheDocument();
  });

  it("never renders marks, averages, or a subject table for an unpublished year", async () => {
    apiMock.getStudent.mockResolvedValue(student());
    apiMock.getStudentResultsReport.mockResolvedValue(report());
    await renderPage();
    await screen.findByText("Results not published yet");
    expect(screen.queryByText("Term 1")).not.toBeInTheDocument();
    expect(screen.queryByText("Term 2")).not.toBeInTheDocument();
    expect(screen.queryByText("Annual / Combined Result")).not.toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });
});

describe("StudentResultsDetailPage — isolation", () => {
  it("requests results scoped to exactly this student and this academic year", async () => {
    apiMock.getStudent.mockResolvedValue(student());
    apiMock.getStudentResultsReport.mockResolvedValue(report());
    await renderPage("year-2026");
    await screen.findByText("Results not published yet");
    expect(apiMock.getStudentResultsReport).toHaveBeenCalledWith("token-1", "stu-1", "year-2026");
    expect(apiMock.getStudent).toHaveBeenCalledWith("token-1", "stu-1");
  });

  it("shows the server's NotFound message rather than any data when another student/school's year is requested", async () => {
    apiMock.getStudent.mockResolvedValue(student());
    apiMock.getStudentResultsReport.mockRejectedValue(new ApiError("Student not found", 404));
    await renderPage("year-of-another-school");
    expect(await screen.findByText("Student not found")).toBeInTheDocument();
    expect(screen.queryByText("Term 1")).not.toBeInTheDocument();
  });
});

describe("StudentResultsDetailPage — back navigation", () => {
  it("links back to the Student Profile page via the breadcrumb", async () => {
    apiMock.getStudent.mockResolvedValue(student());
    apiMock.getStudentResultsReport.mockResolvedValue(report());
    await renderPage();
    const backLink = await screen.findByRole("link", { name: "Ahmed Mohamed" });
    expect(backLink).toHaveAttribute("href", "/schools/school-1/students/stu-1");
  });
});
