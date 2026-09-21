import { describe, it, expect, vi } from "vitest";
import { render, screen, within, fireEvent } from "@testing-library/react";
import type { MyChildAcademicYear, MyResultsReport, PortalResultRow } from "@/lib/api";
import { PortalResults } from "./PortalResults";

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
vi.mock("@/lib/auth-context", () => ({ ApiError }));

const Y2027: MyChildAcademicYear = { id: "year-2027", name: "2027", isCurrent: true, hasAttendance: true };
const Y2026: MyChildAcademicYear = { id: "year-2026", name: "2026", isCurrent: false, hasAttendance: true };

function row(overrides: Partial<PortalResultRow> = {}): PortalResultRow {
  return {
    id: "r1",
    examName: "Midterm",
    examType: "MIDTERM",
    subjectName: "Mathematics",
    marksObtained: 80,
    maxMarks: 100,
    percentage: 80,
    examDate: "2027-03-01T00:00:00.000Z",
    publishedDate: "2027-03-10T00:00:00.000Z",
    ...overrides,
  };
}

function report(overrides: Partial<MyResultsReport> = {}): MyResultsReport {
  return {
    academicYear: { id: "year-2027", name: "2027", isCurrent: true },
    enrollment: { schoolName: "Saamalay Secondary", className: "Form 2", sectionName: "B" },
    terms: [
      { name: "Term 1", termId: "t1", weight: 50, results: [row()], percentage: 80 },
      { name: "Term 2", termId: "t2", weight: 50, results: [row({ id: "r2", examName: "Final", subjectName: "Physics", marksObtained: 60, percentage: 60 })], percentage: 60 },
    ],
    otherResults: [],
    annual: { term1Percentage: 80, term2Percentage: 60, annualPercentage: 70, eligible: true, passMark: 50 },
    ...overrides,
  };
}

function renderResults(opts: { years?: MyChildAcademicYear[]; loadReport?: (id: string) => Promise<MyResultsReport> } = {}) {
  const loadYears = vi.fn().mockResolvedValue(opts.years ?? [Y2027, Y2026]);
  const loadReport = vi.fn(opts.loadReport ?? (() => Promise.resolve(report())));
  render(<PortalResults loadYears={loadYears} loadReport={loadReport} />);
  return { loadYears, loadReport };
}

describe("PortalResults", () => {
  it("defaults to the current academic year and asks the server for exactly that year", async () => {
    const { loadReport } = renderResults();

    await screen.findByText("Term average: 80.00% · weight 50%");
    expect(loadReport).toHaveBeenCalledTimes(1);
    expect(loadReport).toHaveBeenCalledWith("year-2027");
  });

  it("groups results under Term 1 and Term 2, each with marks, max marks, percentage and a term average", async () => {
    renderResults();

    await screen.findByText("Term average: 80.00% · weight 50%");
    expect(screen.getByText("Term average: 60.00% · weight 50%")).toBeInTheDocument();

    // Once as the summary figure label, once as the term card's own title.
    expect(screen.getAllByText("Term 1")).toHaveLength(2);
    expect(screen.getAllByText("Term 2")).toHaveLength(2);
    expect(screen.getByText("80 / 100")).toBeInTheDocument();
    expect(screen.getByText("60 / 100")).toBeInTheDocument();
    expect(screen.getByText("Mathematics")).toBeInTheDocument();
    expect(screen.getByText("Physics")).toBeInTheDocument();
  });

  it("shows the Annual result with the year's weights and an Eligible verdict", async () => {
    renderResults();

    await screen.findByText("Combines Term 1 (50%) and Term 2 (50%). Pass mark: 50%.");
    expect(screen.getByText("70.00%")).toBeInTheDocument();
    expect(screen.getByText("Eligible")).toBeInTheDocument();
  });

  it("shows Not eligible when the annual result is below the pass mark", async () => {
    renderResults({
      loadReport: () =>
        Promise.resolve(report({ annual: { term1Percentage: 45, term2Percentage: 40, annualPercentage: 42.5, eligible: false, passMark: 50 } })),
    });

    expect(await screen.findByText("Not eligible")).toBeInTheDocument();
    expect(screen.getByText("42.50%")).toBeInTheDocument();
  });

  it("Term 2 not published yet: Term 2 and the annual result read Incomplete — never 0%", async () => {
    renderResults({
      loadReport: () =>
        Promise.resolve(
          report({
            terms: [
              { name: "Term 1", termId: "t1", weight: 50, results: [row()], percentage: 80 },
              { name: "Term 2", termId: "t2", weight: 50, results: [], percentage: null },
            ],
            annual: { term1Percentage: 80, term2Percentage: null, annualPercentage: null, eligible: null, passMark: 50 },
          }),
        ),
    });

    expect(await screen.findByText("No published results for Term 2 yet.")).toBeInTheDocument();
    expect(screen.getByText("Term average: Incomplete · weight 50%")).toBeInTheDocument();
    expect(screen.getAllByText("Incomplete").length).toBeGreaterThanOrEqual(3); // Term 2, Annual, Eligibility
    expect(screen.queryByText("0.00%")).not.toBeInTheDocument();
    expect(screen.queryByText("Eligible")).not.toBeInTheDocument();
    expect(screen.queryByText("Not eligible")).not.toBeInTheDocument();
  });

  it("lists term-less published results separately and says they are outside the averages — not as a third term", async () => {
    renderResults({
      loadReport: () => Promise.resolve(report({ otherResults: [row({ id: "r9", examName: "Quiz", subjectName: "Chemistry" })] })),
    });

    expect(await screen.findByText("Other published results")).toBeInTheDocument();
    expect(screen.getByText(/not part of the term or annual averages/)).toBeInTheDocument();
    expect(screen.queryByText("Term 3")).not.toBeInTheDocument();
  });

  it("switching to a historical year requests that year and shows only its report", async () => {
    const { loadReport } = renderResults({
      loadReport: (id) =>
        Promise.resolve(
          id === "year-2026"
            ? report({
                academicYear: { id: "year-2026", name: "2026", isCurrent: false },
                enrollment: { schoolName: "Saamalay Secondary", className: "Form 1", sectionName: "A" },
                terms: [
                  { name: "Term 1", termId: "h1", weight: 50, results: [row({ id: "h1", subjectName: "History", marksObtained: 70, percentage: 70 })], percentage: 70 },
                  { name: "Term 2", termId: "h2", weight: 50, results: [row({ id: "h2", subjectName: "History", marksObtained: 90, percentage: 90 })], percentage: 90 },
                ],
                annual: { term1Percentage: 70, term2Percentage: 90, annualPercentage: 80, eligible: true, passMark: 50 },
              })
            : report(),
        ),
    });
    await screen.findByText("Physics");

    fireEvent.change(screen.getByRole("combobox"), { target: { value: "year-2026" } });

    expect(await screen.findByText(/Form 1/)).toBeInTheDocument();
    expect(loadReport).toHaveBeenLastCalledWith("year-2026");
    expect(screen.queryByText("Physics")).not.toBeInTheDocument();
    expect(screen.getByText("80.00%")).toBeInTheDocument();
  });

  it("offers the current year first and marks it (Current)", async () => {
    renderResults();

    await screen.findByText("Term average: 80.00% · weight 50%");
    expect(screen.getByRole("option", { name: "2027 (Current)" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "2026" })).toBeInTheDocument();
  });

  it("shows the server's error instead of data when the report is refused", async () => {
    renderResults({ loadReport: () => Promise.reject(new ApiError("Student not found", 404)) });

    expect(await screen.findByText("Student not found")).toBeInTheDocument();
    expect(screen.queryByText("Annual result")).not.toBeInTheDocument();
  });

  it("shows an empty state when there is no enrollment history", async () => {
    const { loadReport } = renderResults({ years: [] });

    expect(await screen.findByText("No academic year on record")).toBeInTheDocument();
    expect(loadReport).not.toHaveBeenCalled();
  });

  it("row percentages are 1-decimal badges, distinct from the 2-decimal term averages", async () => {
    renderResults();

    await screen.findByText("Term average: 80.00% · weight 50%");
    const table = screen.getAllByRole("table")[0];
    expect(within(table).getByText("80%")).toBeInTheDocument();
  });
});
