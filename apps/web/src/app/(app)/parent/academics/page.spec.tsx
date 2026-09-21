import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { MyResultsReport } from "@/lib/api";
import AcademicsPage from "./page";

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

const useSelectedChildMock = vi.hoisted(() => vi.fn());
vi.mock("@/features/parent-portal/SelectedChildContext", () => ({ useSelectedChild: () => useSelectedChildMock() }));

const apiMock = vi.hoisted(() => ({
  getMyChildSubjects: vi.fn(),
  getMyChildAcademicYears: vi.fn(),
  getMyChildResultsReport: vi.fn(),
  getMyChildResults: vi.fn(),
}));
vi.mock("@/lib/api", () => ({ api: apiMock }));

function reportFor(subject: string, marks: number, yearName = "2027"): MyResultsReport {
  const r = {
    id: `r-${subject}`, examName: "Midterm", examType: "MIDTERM", subjectName: subject, marksObtained: marks, maxMarks: 100,
    percentage: marks, examDate: null, publishedDate: null,
  };
  return {
    academicYear: { id: "year-1", name: yearName, isCurrent: true },
    enrollment: { schoolName: "Saamalay Primary", className: "Class 5", sectionName: "A" },
    terms: [
      { name: "Term 1", termId: "t1", weight: 50, results: [r], percentage: marks },
      { name: "Term 2", termId: "t2", weight: 50, results: [], percentage: null },
    ],
    otherResults: [],
    annual: { term1Percentage: marks, term2Percentage: null, annualPercentage: null, eligible: null, passMark: 50 },
  };
}

function selectChild(studentId: string) {
  useSelectedChildMock.mockReturnValue({ selectedChild: { studentId }, loading: false, children: [{ studentId }] });
}

beforeEach(() => {
  vi.clearAllMocks();
  useAuthMock.mockReturnValue({ accessToken: "token-1" });
  selectChild("stu-1");
  apiMock.getMyChildSubjects.mockResolvedValue([]);
  apiMock.getMyChildAcademicYears.mockResolvedValue([{ id: "year-1", name: "2027", isCurrent: true, hasAttendance: true }]);
  apiMock.getMyChildResultsReport.mockImplementation((_token: string, studentId: string) =>
    Promise.resolve(studentId === "stu-1" ? reportFor("Mathematics", 85) : reportFor("Drawing", 40)),
  );
});

describe("Parent AcademicsPage — Exams & Results", () => {
  it("shows the selected child's Term 1 / Term 2 / Annual report, requested for that child only", async () => {
    render(<AcademicsPage />);
    fireEvent.click(screen.getByRole("button", { name: "Exams & Results" }));

    expect(await screen.findByText("85 / 100")).toBeInTheDocument();
    expect(apiMock.getMyChildAcademicYears).toHaveBeenCalledWith("token-1", "stu-1");
    expect(apiMock.getMyChildResultsReport).toHaveBeenCalledWith("token-1", "stu-1", "year-1");
    expect(apiMock.getMyChildResultsReport).not.toHaveBeenCalledWith("token-1", "stu-2", expect.anything());
    expect(screen.getByText("No published results for Term 2 yet.")).toBeInTheDocument();
  });

  it("switching child shows only the other child's results — never both, never a blend", async () => {
    const { rerender } = render(<AcademicsPage />);
    fireEvent.click(screen.getByRole("button", { name: "Exams & Results" }));
    await screen.findByText("85 / 100");

    selectChild("stu-2");
    rerender(<AcademicsPage />);

    expect(await screen.findByText("40 / 100")).toBeInTheDocument();
    expect(screen.queryByText("85 / 100")).not.toBeInTheDocument();
    expect(apiMock.getMyChildResultsReport).toHaveBeenCalledWith("token-1", "stu-2", "year-1");
  });

  it("no longer uses the flat, year-mixing results list", async () => {
    render(<AcademicsPage />);
    fireEvent.click(screen.getByRole("button", { name: "Exams & Results" }));
    await screen.findByText("85 / 100");

    expect(apiMock.getMyChildResults).not.toHaveBeenCalled();
  });
});

describe("Parent AcademicsPage — Performance", () => {
  it("shows the current year's term/annual figures and per-subject averages, not a blend of every result ever", async () => {
    render(<AcademicsPage />);
    fireEvent.click(screen.getByRole("button", { name: "Performance" }));

    expect(await screen.findByText("Average by subject")).toBeInTheDocument();
    expect(screen.getByText("Mathematics")).toBeInTheDocument();
    expect(screen.getByText("85%")).toBeInTheDocument();
    expect(screen.queryByText("Overall average")).not.toBeInTheDocument();
    // The Performance tab asks for the default (current) year, no year param.
    expect(apiMock.getMyChildResultsReport).toHaveBeenCalledWith("token-1", "stu-1");
  });

  it("says so when nothing has been published yet", async () => {
    apiMock.getMyChildResultsReport.mockResolvedValue({
      ...reportFor("Mathematics", 85),
      terms: [
        { name: "Term 1", termId: "t1", weight: 50, results: [], percentage: null },
        { name: "Term 2", termId: "t2", weight: 50, results: [], percentage: null },
      ],
    });
    render(<AcademicsPage />);
    fireEvent.click(screen.getByRole("button", { name: "Performance" }));

    expect(await screen.findByText("No published results yet")).toBeInTheDocument();
  });
});
