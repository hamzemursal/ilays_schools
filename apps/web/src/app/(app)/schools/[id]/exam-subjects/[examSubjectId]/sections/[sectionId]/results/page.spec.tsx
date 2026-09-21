import { Suspense } from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ResultsForSection, ResultRow } from "@/lib/api";
import ResultsPage from "./page";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }), usePathname: () => "/" }));
vi.mock("next/link", () => ({ default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a> }));

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
  getResults: vi.fn(),
  enterMarks: vi.fn(),
  submitResultsForReview: vi.fn(),
  returnResultsForCorrection: vi.fn(),
  approveResultsSubmission: vi.fn(),
  publishResultsSubmission: vi.fn(),
  unpublishResultsSubmission: vi.fn(),
}));
vi.mock("@/lib/api", () => ({ api: apiMock }));

const TEACHER = { roles: ["TEACHER"], permissions: ["results.enter", "results.view"] };
const ADMIN = { roles: ["SCHOOL_ADMIN"], permissions: ["results.enter", "results.approve", "results.view"] };

function student(id: string, name: string, roll: number, overrides: Partial<ResultRow> = {}): ResultRow {
  return {
    enrollmentId: id,
    studentId: `s-${id}`,
    studentNumber: `STU-${roll}`,
    firstName: name,
    lastName: "Test",
    rollNumber: roll,
    photoUrl: null,
    marksObtained: null,
    percentage: null,
    hasMark: false,
    isAbsent: false,
    ...overrides,
  };
}

function results(status: ResultsForSection["submission"]["status"], students: ResultRow[], overrides: Partial<ResultsForSection> = {}): ResultsForSection {
  const completed = students.filter((s) => s.hasMark || s.isAbsent).length;
  return {
    context: {
      examId: "exam-1",
      examName: "Term 2 Exam",
      examType: "FINAL",
      academicYearId: "year-1",
      academicYearName: "2026-2027",
      schoolName: "Test School",
      schoolLogoUrl: null,
      className: "Form 2",
      sectionName: "A",
      subjectName: "Mathematics",
      examDate: null,
      teacherName: null,
    },
    maxMarks: 50,
    students,
    completedCount: completed,
    absentCount: students.filter((s) => s.isAbsent).length,
    missingCount: students.length - completed,
    average: null,
    highest: null,
    lowest: null,
    submission: { status, notes: null, submittedAt: null, returnedAt: null, returnReason: status === "NEEDS_CORRECTION" ? "Fix Hodan's mark" : null, approvedAt: null, publishedAt: null },
    ...overrides,
  };
}

async function renderPage(user: typeof TEACHER | typeof ADMIN, data: ResultsForSection) {
  authMock.mockReturnValue({ accessToken: "token", user });
  apiMock.getResults.mockResolvedValue(data);
  const params = Promise.resolve({ id: "school-1", examSubjectId: "es-1", sectionId: "sec-1" });
  await act(async () => {
    render(
      <Suspense fallback={null}>
        <ResultsPage params={params} />
      </Suspense>,
    );
  });
  await screen.findByText("Term 2 Exam");
}

beforeEach(() => vi.clearAllMocks());

const HODAN = () => student("e1", "Hodan", 1, { marksObtained: "40", percentage: 80, hasMark: true });
const AMINA = () => student("e2", "Amina", 2);
const HASSAN = () => student("e3", "Hassan", 3);

describe("Results page — teacher entering and correcting marks", () => {
  it("saves typed marks and an Absent student as absent — a blank student is left alone, never sent as 0", async () => {
    apiMock.enterMarks.mockResolvedValue(results("DRAFT", [HODAN(), AMINA(), HASSAN()]));
    const user = userEvent.setup();
    await renderPage(TEACHER, results("DRAFT", [HODAN(), AMINA(), HASSAN()]));

    await user.clear(screen.getByLabelText("Mark for Hodan Test"));
    await user.type(screen.getByLabelText("Mark for Hodan Test"), "45"); // correct 40 → 45
    await user.click(screen.getByLabelText("Absent: Amina Test"));
    await user.click(screen.getByRole("button", { name: "Save Draft" }));

    await waitFor(() =>
      expect(apiMock.enterMarks).toHaveBeenCalledWith("token", "school-1", "es-1", "sec-1", [
        { enrollmentId: "e1", marksObtained: 45 },
        { enrollmentId: "e2", isAbsent: true },
      ]),
    );
    const sent = apiMock.enterMarks.mock.calls[0][4] as Array<{ enrollmentId: string }>;
    expect(sent.find((e) => e.enrollmentId === "e3")).toBeUndefined();
  });

  it("marking a student Absent clears and disables their mark box — absence and a mark can't both be entered", async () => {
    const user = userEvent.setup();
    await renderPage(TEACHER, results("DRAFT", [HODAN()]));
    const box = screen.getByLabelText("Mark for Hodan Test") as HTMLInputElement;
    expect(box.value).toBe("40");

    await user.click(screen.getByLabelText("Absent: Hodan Test"));

    expect(box.value).toBe("");
    expect(box).toBeDisabled();
  });

  it("an absent student is shown as Absent (not as 0 or Missing), and the header counts them", async () => {
    await renderPage(TEACHER, results("DRAFT", [HODAN(), student("e2", "Amina", 2, { isAbsent: true })]));

    expect(screen.getByText("Absent", { selector: "span" })).toBeInTheDocument();
    expect(screen.getByText(/2 \/ 2 student\(s\) completed \(1 absent\)/)).toBeInTheDocument();
    expect((screen.getByLabelText("Absent: Amina Test") as HTMLInputElement).checked).toBe(true);
  });

  it("can correct a previously entered mark after the results were returned for correction", async () => {
    await renderPage(TEACHER, results("NEEDS_CORRECTION", [HODAN()]));

    expect(screen.getByText("Fix Hodan's mark")).toBeInTheDocument();
    expect(screen.getByLabelText("Mark for Hodan Test")).toBeEnabled();
    expect(screen.getByRole("button", { name: "Resubmit for Review" })).toBeInTheDocument();
  });

  it.each(["SUBMITTED", "APPROVED", "PUBLISHED"] as const)("cannot edit anything while %s", async (status) => {
    await renderPage(TEACHER, results(status, [HODAN()]));

    expect(screen.getByLabelText("Mark for Hodan Test")).toBeDisabled();
    expect(screen.getByLabelText("Absent: Hodan Test")).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Save Draft" })).not.toBeInTheDocument();
  });
});

describe("Results page — admin editing and correction", () => {
  it("an admin can now enter and correct marks (Save Draft / Submit were hidden from admins before)", async () => {
    apiMock.enterMarks.mockResolvedValue(results("NEEDS_CORRECTION", [HODAN()]));
    const user = userEvent.setup();
    await renderPage(ADMIN, results("NEEDS_CORRECTION", [HODAN()]));

    const box = screen.getByLabelText("Mark for Hodan Test");
    expect(box).toBeEnabled();
    await user.clear(box);
    await user.type(box, "30"); // decrease 40 → 30
    await user.click(screen.getByRole("button", { name: "Save Draft" }));

    await waitFor(() =>
      expect(apiMock.enterMarks).toHaveBeenCalledWith("token", "school-1", "es-1", "sec-1", [{ enrollmentId: "e1", marksObtained: 30 }]),
    );
  });

  it("a submitted set shows the admin Return for Correction and Approve — not editing", async () => {
    await renderPage(ADMIN, results("SUBMITTED", [HODAN()]));

    expect(screen.getByRole("button", { name: "Return for Correction" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Approve Results" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save Draft" })).not.toBeInTheDocument();
  });

  it("an APPROVED set can now be sent back for correction (previously a dead end), alongside Publish", async () => {
    apiMock.returnResultsForCorrection.mockResolvedValue(results("NEEDS_CORRECTION", [HODAN()]));
    const user = userEvent.setup();
    await renderPage(ADMIN, results("APPROVED", [HODAN()]));

    expect(screen.getByRole("button", { name: "Publish Results" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Return for Correction" }));
    // The dialog's own confirm button carries the same label — scope to it.
    await user.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Return for Correction" }));

    await waitFor(() => expect(apiMock.returnResultsForCorrection).toHaveBeenCalled());
    expect(apiMock.returnResultsForCorrection.mock.calls[0].slice(0, 4)).toEqual(["token", "school-1", "es-1", "sec-1"]);
  });

  it("a PUBLISHED set offers no Return for Correction — it has to be unpublished first", async () => {
    await renderPage(ADMIN, results("PUBLISHED", [HODAN()]));

    expect(screen.queryByRole("button", { name: "Return for Correction" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Undo Publish" })).toBeInTheDocument();
  });
});
