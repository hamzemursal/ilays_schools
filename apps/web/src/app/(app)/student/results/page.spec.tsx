import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
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

const REPORT: MyResultsReport = {
  academicYear: { id: "year-1", name: "2027", isCurrent: true },
  enrollment: { schoolName: "Saamalay Secondary", className: "Form 2", sectionName: "B" },
  terms: [
    {
      name: "Term 1",
      termId: "t1",
      weight: 50,
      results: [
        {
          id: "r1", examName: "Term 1 Exam", subjectName: "Mathematics", marksObtained: 85, maxMarks: 100,
          percentage: 85, examDate: null, publishedDate: null,
        },
      ],
      percentage: 85,
    },
    { name: "Term 2", termId: "t2", weight: 50, results: [], percentage: null },
  ],
  otherResults: [],
  annual: { term1Percentage: 85, term2Percentage: null, annualPercentage: null },
};

beforeEach(() => {
  vi.clearAllMocks();
  useAuthMock.mockReturnValue({ accessToken: "token-1" });
  apiMock.getMyStudentAcademicYears.mockResolvedValue([{ id: "year-1", name: "2027", isCurrent: true, hasAttendance: true }]);
  apiMock.getMyStudentResultsReport.mockResolvedValue(REPORT);
});

describe("StudentResultsPage", () => {
  it("loads the signed-in student's own report for the current year — no student id is ever sent", async () => {
    render(<StudentResultsPage />);

    expect(await screen.findByText("85 / 100")).toBeInTheDocument();
    expect(apiMock.getMyStudentResultsReport).toHaveBeenCalledWith("token-1", "year-1");
    expect(apiMock.getMyStudentAcademicYears).toHaveBeenCalledWith("token-1");
  });

  it("no longer uses the flat, year-mixing results list", async () => {
    render(<StudentResultsPage />);

    await screen.findByText("85 / 100");
    expect(apiMock.getMyStudentResults).not.toHaveBeenCalled();
  });

  it("shows Term 1 published and Term 2 / Annual as Incomplete", async () => {
    render(<StudentResultsPage />);

    expect(await screen.findByText("No published results for Term 2 yet.")).toBeInTheDocument();
    expect(screen.getByText("Term average: 85.00% · weight 50%")).toBeInTheDocument();
    expect(screen.getByText("Term average: Incomplete · weight 50%")).toBeInTheDocument();
  });

  it("shows a loading skeleton, and makes no request, until a session token exists", () => {
    useAuthMock.mockReturnValue({ accessToken: null });
    render(<StudentResultsPage />);

    expect(apiMock.getMyStudentAcademicYears).not.toHaveBeenCalled();
    expect(apiMock.getMyStudentResultsReport).not.toHaveBeenCalled();
  });
});
