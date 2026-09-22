import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { MyResultsReport } from "@/lib/api";
import StudentResultsPage from "./page";

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
const useAuthMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth-context", () => ({ useAuth: () => useAuthMock(), ApiError }));

const apiMock = vi.hoisted(() => ({
  getMyStudentAcademicYears: vi.fn(),
  getMyStudentResultsReport: vi.fn(),
  getMyStudentResults: vi.fn(),
}));
vi.mock("@/lib/api", () => ({ api: apiMock }));

function report(overrides: Partial<MyResultsReport> = {}): MyResultsReport {
  return {
    academicYear: { id: "year-1", name: "2027", isCurrent: true },
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

// A single published Mathematics row — the one real fact every "published"
// fixture below reuses, never invented per test.
const MATHS_ROW = {
  id: "r1",
  examName: "Term 1 Exam",
  subjectName: "Mathematics",
  marksObtained: 85,
  maxMarks: 100,
  percentage: 85,
  examDate: null,
  publishedDate: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  useAuthMock.mockReturnValue({ accessToken: "token-1" });
  apiMock.getMyStudentAcademicYears.mockResolvedValue([{ id: "year-1", name: "2027", isCurrent: true, hasAttendance: true }]);
  apiMock.getMyStudentResultsReport.mockResolvedValue(report());
});

describe("StudentResultsPage — data plumbing (unchanged)", () => {
  it("loads the signed-in student's own report for the current year — no student id is ever sent", async () => {
    apiMock.getMyStudentResultsReport.mockResolvedValue(
      report({ terms: [{ name: "Term 1", termId: "t1", weight: 50, results: [MATHS_ROW], percentage: 85 }, report().terms[1]] }),
    );
    render(<StudentResultsPage />);

    expect(await screen.findByText("85 / 100")).toBeInTheDocument();
    expect(apiMock.getMyStudentResultsReport).toHaveBeenCalledWith("token-1", "year-1");
    expect(apiMock.getMyStudentAcademicYears).toHaveBeenCalledWith("token-1");
  });

  it("no longer uses the flat, year-mixing results list", async () => {
    render(<StudentResultsPage />);
    await screen.findByText("Academic year");
    expect(apiMock.getMyStudentResults).not.toHaveBeenCalled();
  });

  it("shows a loading skeleton, and makes no request, until a session token exists", () => {
    useAuthMock.mockReturnValue({ accessToken: null });
    render(<StudentResultsPage />);

    expect(apiMock.getMyStudentAcademicYears).not.toHaveBeenCalled();
    expect(apiMock.getMyStudentResultsReport).not.toHaveBeenCalled();
  });
});

describe("StudentResultsPage — current year, nothing published yet", () => {
  it("shows Term 1 and Term 2 as Not Published, and the Overall Average as '-' with an explanation", async () => {
    render(<StudentResultsPage />);

    expect(await screen.findByText("Current year")).toBeInTheDocument();
    const notPublished = screen.getAllByText("Not Published");
    expect(notPublished).toHaveLength(2); // one per term card, never a third for Overall Average
    expect(screen.getByText("No results available for Term 1 yet.")).toBeInTheDocument();
    expect(screen.getByText("No results available for Term 2 yet.")).toBeInTheDocument();

    expect(screen.getByText("Overall Average")).toBeInTheDocument();
    expect(screen.getByText("-")).toBeInTheDocument();
    expect(
      screen.getByText("The Overall Average becomes available once both Term 1 and Term 2 results are published."),
    ).toBeInTheDocument();
  });

  it("never renders a mark, a subject row or a percentage badge when nothing is published", async () => {
    render(<StudentResultsPage />);
    await screen.findAllByText("Not Published");

    expect(screen.queryByText(/\d+ \/ \d+/)).not.toBeInTheDocument();
    expect(screen.queryByText("Mathematics")).not.toBeInTheDocument();
  });
});

describe("StudentResultsPage — Term 1 published only", () => {
  beforeEach(() => {
    apiMock.getMyStudentResultsReport.mockResolvedValue(
      report({
        terms: [
          { name: "Term 1", termId: "t1", weight: 50, results: [MATHS_ROW], percentage: 85 },
          { name: "Term 2", termId: "t2", weight: 50, results: [], percentage: null },
        ],
        annual: { term1Percentage: 85, term2Percentage: null, annualPercentage: null },
      }),
    );
  });

  it("Term 1 shows the real published subject, mark and percentage, with its average and weight", async () => {
    render(<StudentResultsPage />);
    const term1Card = (await screen.findByText("Term 1 Results")).closest("div.overflow-hidden") as HTMLElement;

    expect(within(term1Card).getByText("Mathematics")).toBeInTheDocument();
    expect(within(term1Card).getByText("85 / 100")).toBeInTheDocument();
    expect(within(term1Card).getByText("85%")).toBeInTheDocument();
    expect(within(term1Card).getByText("Weight: 50% of the annual result")).toBeInTheDocument();
    expect(within(term1Card).getByText("Term 1 Average")).toBeInTheDocument();
    expect(within(term1Card).getByText("85.00%")).toBeInTheDocument();
  });

  it("Term 2 still reads Not Published, and the Overall Average is still '-'", async () => {
    render(<StudentResultsPage />);
    await screen.findByText("Term 1 Results");

    expect(screen.getByText("No results available for Term 2 yet.")).toBeInTheDocument();
    expect(screen.getByText("-")).toBeInTheDocument();
  });
});

describe("StudentResultsPage — Term 2 published only", () => {
  it("Term 2 shows real results while Term 1 reads Not Published", async () => {
    apiMock.getMyStudentResultsReport.mockResolvedValue(
      report({
        terms: [
          { name: "Term 1", termId: "t1", weight: 50, results: [], percentage: null },
          { name: "Term 2", termId: "t2", weight: 50, results: [{ ...MATHS_ROW, id: "r2" }], percentage: 85 },
        ],
        annual: { term1Percentage: null, term2Percentage: 85, annualPercentage: null },
      }),
    );
    render(<StudentResultsPage />);
    const term2Card = (await screen.findByText("Term 2 Results")).closest("div.overflow-hidden") as HTMLElement;

    expect(within(term2Card).getByText("Mathematics")).toBeInTheDocument();
    expect(within(term2Card).getByText("Term 2 Average")).toBeInTheDocument();
    expect(screen.getByText("No results available for Term 1 yet.")).toBeInTheDocument();
  });
});

describe("StudentResultsPage — both terms published", () => {
  it("shows the real weighted Overall Average, distinct from the two term cards", async () => {
    apiMock.getMyStudentResultsReport.mockResolvedValue(
      report({
        terms: [
          { name: "Term 1", termId: "t1", weight: 50, results: [MATHS_ROW], percentage: 85 },
          { name: "Term 2", termId: "t2", weight: 50, results: [{ ...MATHS_ROW, id: "r2", marksObtained: 75, percentage: 75 }], percentage: 75 },
        ],
        annual: { term1Percentage: 85, term2Percentage: 75, annualPercentage: 80 },
      }),
    );
    render(<StudentResultsPage />);

    expect(await screen.findByText("Overall Average")).toBeInTheDocument();
    expect(screen.getByText("80.00%")).toBeInTheDocument();
    expect(screen.getByText("Combines Term 1 and Term 2")).toBeInTheDocument();
    expect(screen.queryByText("Not Published")).not.toBeInTheDocument();
    // The breakdown inside the Overall Average card, not a third term card.
    expect(screen.getByText("Term 1 (50%)")).toBeInTheDocument();
    expect(screen.getByText("Term 2 (50%)")).toBeInTheDocument();
  });
});

describe("StudentResultsPage — academic-year separation", () => {
  it("switching years shows only the selected year's own report, never mixed with another year's", async () => {
    const user = userEvent.setup();
    apiMock.getMyStudentAcademicYears.mockResolvedValue([
      { id: "year-2", name: "2028", isCurrent: true, hasAttendance: true },
      { id: "year-1", name: "2027", isCurrent: false, hasAttendance: true },
    ]);
    apiMock.getMyStudentResultsReport.mockImplementation((_token: string, academicYearId: string) =>
      Promise.resolve(
        academicYearId === "year-1"
          ? report({
              academicYear: { id: "year-1", name: "2027", isCurrent: false },
              terms: [{ name: "Term 1", termId: "t1", weight: 50, results: [MATHS_ROW], percentage: 85 }, report().terms[1]],
            })
          : report({ academicYear: { id: "year-2", name: "2028", isCurrent: true } }),
      ),
    );
    render(<StudentResultsPage />);

    expect(await screen.findByText("Current year")).toBeInTheDocument();
    expect(screen.queryByText("Mathematics")).not.toBeInTheDocument();

    await user.selectOptions(screen.getByRole("combobox"), "year-1");

    expect(await screen.findByText("Mathematics")).toBeInTheDocument();
    expect(screen.queryByText("Current year")).not.toBeInTheDocument();
    expect(apiMock.getMyStudentResultsReport).toHaveBeenCalledWith("token-1", "year-1");
  });
});
