import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { MyResultsReport, StudentEnrollmentRecord } from "@/lib/api";
import { AcademicHistoryTimeline } from "./AcademicHistoryTimeline";

function enrollment(overrides: Partial<StudentEnrollmentRecord> = {}): StudentEnrollmentRecord {
  return {
    id: "enr-2027",
    studentNumber: "STU-2027-00001",
    rollNumber: 3,
    status: "ACTIVE",
    startDate: "2027-01-01",
    endDate: null,
    school: { id: "school-1", name: "Saamalay Secondary" },
    academicYear: { id: "year-2027", name: "2027", isCurrent: true },
    class: { id: "class-form3", name: "Form 3" },
    section: { id: "section-a", name: "A" },
    ...overrides,
  };
}

const CURRENT = enrollment();
const PREVIOUS = enrollment({
  id: "enr-2026",
  status: "PROMOTED",
  academicYear: { id: "year-2026", name: "2026", isCurrent: false },
  class: { id: "class-form2", name: "Form 2" },
  section: { id: "section-b", name: "B" },
});

function report(overrides: Partial<MyResultsReport> = {}): MyResultsReport {
  return {
    academicYear: { id: "year-2026", name: "2026", isCurrent: false },
    enrollment: { schoolName: "Saamalay Secondary", className: "Form 2", sectionName: "B" },
    terms: [
      { name: "Term 1", termId: "t1", weight: 50, results: [], percentage: null },
      { name: "Term 2", termId: "t2", weight: 50, results: [], percentage: null },
    ],
    otherResults: [],
    annual: { term1Percentage: null, term2Percentage: null, annualPercentage: null },
    ...overrides,
  };
}

function renderTimeline(props: Partial<Parameters<typeof AcademicHistoryTimeline>[0]> = {}) {
  const loadResultsReport = props.loadResultsReport ?? vi.fn().mockResolvedValue(report());
  return {
    loadResultsReport,
    ...render(
      <AcademicHistoryTimeline
        enrollments={[CURRENT, PREVIOUS]}
        studentId="stu-1"
        accessToken="token-1"
        canViewResults
        loadResultsReport={loadResultsReport}
        {...props}
      />,
    ),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("AcademicHistoryTimeline — Current Year / Previous Year labeling", () => {
  it("marks the current-year enrollment as Current Year and others as Previous Year", () => {
    renderTimeline();
    expect(screen.getByText("Current Year")).toBeInTheDocument();
    expect(screen.getByText("Previous Year")).toBeInTheDocument();
  });

  it("shows an empty state when there is no enrollment at all", () => {
    renderTimeline({ enrollments: [] });
    expect(screen.getByText("No enrollment history yet")).toBeInTheDocument();
  });
});

describe("AcademicHistoryTimeline — View Results", () => {
  it("hides the View Results button entirely without canViewResults", () => {
    renderTimeline({ canViewResults: false });
    expect(screen.queryByRole("button", { name: "View Results" })).not.toBeInTheDocument();
  });

  it("loads and shows the PREVIOUS year's real term results when opened", async () => {
    const user = userEvent.setup();
    const previousReport = report({
      terms: [
        { name: "Term 1", termId: "t1", weight: 50, results: [{ id: "r1", examName: "Midterm", subjectName: "Mathematics", marksObtained: 78, maxMarks: 100, percentage: 78, examDate: null, publishedDate: null }], percentage: 78 },
        { name: "Term 2", termId: "t2", weight: 50, results: [{ id: "r2", examName: "Final", subjectName: "Mathematics", marksObtained: 81, maxMarks: 100, percentage: 81, examDate: null, publishedDate: null }], percentage: 81 },
      ],
      annual: { term1Percentage: 78, term2Percentage: 81, annualPercentage: 79.5 },
    });
    const loadResultsReport = vi.fn().mockResolvedValue(previousReport);
    renderTimeline({ loadResultsReport });

    const buttons = screen.getAllByRole("button", { name: "View Results" });
    await user.click(buttons[1]); // the Previous Year (Form 2 · Section B) row

    expect(loadResultsReport).toHaveBeenCalledWith("year-2026");
    expect((await screen.findAllByText("Mathematics")).length).toBe(2);
    expect(screen.getByText("78%")).toBeInTheDocument();
    expect(screen.getByText("81%")).toBeInTheDocument();
    expect(screen.getByText("79.50%")).toBeInTheDocument();
  });

  it("never shows the current year's results under a previous year's panel", async () => {
    const user = userEvent.setup();
    const currentReport = report({
      academicYear: { id: "year-2027", name: "2027", isCurrent: true },
      terms: [
        { name: "Term 1", termId: "t1", weight: 50, results: [{ id: "cur-1", examName: "Midterm", subjectName: "CURRENT-YEAR-SUBJECT", marksObtained: 99, maxMarks: 100, percentage: 99, examDate: null, publishedDate: null }], percentage: 99 },
        { name: "Term 2", termId: "t2", weight: 50, results: [], percentage: null },
      ],
    });
    const previousReport = report({
      terms: [
        { name: "Term 1", termId: "t1", weight: 50, results: [{ id: "prev-1", examName: "Midterm", subjectName: "PREVIOUS-YEAR-SUBJECT", marksObtained: 60, maxMarks: 100, percentage: 60, examDate: null, publishedDate: null }], percentage: 60 },
        { name: "Term 2", termId: "t2", weight: 50, results: [], percentage: null },
      ],
    });
    const loadResultsReport = vi
      .fn()
      .mockImplementation((academicYearId: string) => Promise.resolve(academicYearId === "year-2027" ? currentReport : previousReport));
    renderTimeline({ loadResultsReport });

    const buttons = screen.getAllByRole("button", { name: "View Results" });
    await user.click(buttons[1]); // Previous Year row only

    expect(await screen.findByText("PREVIOUS-YEAR-SUBJECT")).toBeInTheDocument();
    expect(screen.queryByText("CURRENT-YEAR-SUBJECT")).not.toBeInTheDocument();
    expect(loadResultsReport).toHaveBeenCalledTimes(1);
    expect(loadResultsReport).toHaveBeenCalledWith("year-2026");
  });

  it("shows 'Results not published' for a previous year with no published results yet", async () => {
    const user = userEvent.setup();
    const loadResultsReport = vi.fn().mockResolvedValue(report());
    renderTimeline({ loadResultsReport });

    const buttons = screen.getAllByRole("button", { name: "View Results" });
    await user.click(buttons[1]);

    expect(await screen.findByText("Results not published")).toBeInTheDocument();
  });

  it("shows the API error message if the results report fails to load", async () => {
    const user = userEvent.setup();
    class ApiError extends Error {}
    const loadResultsReport = vi.fn().mockRejectedValue(new ApiError("Failed to load results"));
    renderTimeline({ loadResultsReport });

    const buttons = screen.getAllByRole("button", { name: "View Results" });
    await user.click(buttons[1]);

    expect(await screen.findByText("Failed to load results")).toBeInTheDocument();
  });

  it("collapses the panel again on a second click without refetching", async () => {
    const user = userEvent.setup();
    const loadResultsReport = vi.fn().mockResolvedValue(report());
    renderTimeline({ loadResultsReport });

    const buttons = screen.getAllByRole("button", { name: "View Results" });
    await user.click(buttons[1]);
    expect(await screen.findByText("Results not published")).toBeInTheDocument();

    await user.click(buttons[1]);
    expect(screen.queryByText("Results not published")).not.toBeInTheDocument();

    await user.click(buttons[1]);
    expect(await screen.findByText("Results not published")).toBeInTheDocument();
    expect(loadResultsReport).toHaveBeenCalledTimes(1);
  });
});
