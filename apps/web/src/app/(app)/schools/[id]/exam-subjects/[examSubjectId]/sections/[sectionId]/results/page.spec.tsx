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

function withContext(data: ResultsForSection, context: Partial<ResultsForSection["context"]>): ResultsForSection {
  return { ...data, context: { ...data.context, ...context } };
}

describe("Results page — exam context is spelled out", () => {
  const CONTEXT = { termName: "Term 1", passingMark: 20, examDate: "2027-03-01T00:00:00.000Z" };

  it("shows Exam Name, Subject, Class, Section, Academic Year, Term, Exam Date, Maximum Marks, Pass Mark and Status", async () => {
    await renderPage(TEACHER, withContext(results("DRAFT", [HODAN()]), CONTEXT));

    const grid = screen.getByText("Exam Name").closest("dl") as HTMLElement;
    const value = (label: string) => within(grid).getByText(label).nextElementSibling?.textContent;
    expect(value("Exam Name")).toBe("Term 2 Exam");
    expect(value("Subject")).toBe("Mathematics");
    expect(value("Class")).toBe("Form 2");
    expect(value("Section")).toBe("A");
    expect(value("Academic Year")).toBe("2026-2027");
    expect(value("Term")).toBe("Term 1");
    expect(value("Exam Date")).toBe(new Date("2027-03-01T00:00:00.000Z").toLocaleDateString());
    expect(value("Maximum Marks")).toBe("50");
    expect(value("Pass Mark")).toBe("20");
    expect(value("Status")).toBe("Draft");
  });

  it("says so plainly when there is no pass mark, term or date", async () => {
    await renderPage(TEACHER, withContext(results("DRAFT", [HODAN()]), { termName: null, passingMark: null, examDate: null }));

    const grid = screen.getByText("Exam Name").closest("dl") as HTMLElement;
    const value = (label: string) => within(grid).getByText(label).nextElementSibling?.textContent;
    expect(value("Pass Mark")).toBe("Not set");
    expect(value("Term")).toBe("No term assigned");
    expect(value("Exam Date")).toBe("Not set");
  });

  it("a teacher has no control over Maximum Marks or Pass Mark - the only inputs are student marks and Absent", async () => {
    await renderPage(TEACHER, withContext(results("DRAFT", [HODAN(), AMINA()]), CONTEXT));

    const inputs = screen.getAllByRole("spinbutton");
    expect(inputs.map((i) => i.getAttribute("aria-label"))).toEqual(["Mark for Hodan Test", "Mark for Amina Test"]);
    expect(screen.queryByLabelText(/maximum/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/pass mark/i)).not.toBeInTheDocument();
    expect(screen.getByText(/set by an Admin and can.t be changed here/)).toBeInTheDocument();
  });
});

describe("Results page - mark validation is visible and enforced", () => {
  it.each([
    ["51", "Above the maximum of 50"],
    ["-1", "A mark can't be negative"],
    ["12.345", "Use at most 2 decimal places"],
  ])("a mark of %s shows the message under that student's row and blocks Save and Submit", async (typed, message) => {
    const user = userEvent.setup();
    await renderPage(TEACHER, results("DRAFT", [HODAN(), AMINA()]));

    await user.type(screen.getByLabelText("Mark for Amina Test"), typed);

    const box = screen.getByLabelText("Mark for Amina Test");
    expect(box).toHaveAttribute("aria-invalid", "true");
    expect(within(box.parentElement as HTMLElement).getByRole("alert")).toHaveTextContent(message);
    expect(screen.getByRole("button", { name: "Save Draft" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Submit for Review" })).toBeDisabled();
    expect(apiMock.enterMarks).not.toHaveBeenCalled();
  });

  it.each(["0", "50", "49.5", "12.25"])("%s is accepted (0 <= mark <= maximum, up to 2 decimals)", async (typed) => {
    const user = userEvent.setup();
    await renderPage(TEACHER, results("DRAFT", [AMINA()]));

    await user.type(screen.getByLabelText("Mark for Amina Test"), typed);

    expect(screen.getByLabelText("Mark for Amina Test")).not.toHaveAttribute("aria-invalid");
    expect(screen.getByRole("button", { name: "Save Draft" })).toBeEnabled();
  });

  it("correcting the mark clears the error and re-enables Save", async () => {
    const user = userEvent.setup();
    await renderPage(TEACHER, results("DRAFT", [AMINA()]));
    await user.type(screen.getByLabelText("Mark for Amina Test"), "99");
    expect(screen.getByRole("button", { name: "Save Draft" })).toBeDisabled();

    await user.clear(screen.getByLabelText("Mark for Amina Test"));
    await user.type(screen.getByLabelText("Mark for Amina Test"), "45");

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save Draft" })).toBeEnabled();
  });

  it("an ALREADY-SAVED mark above the maximum is flagged on load - this is what made unrelated saves fail", async () => {
    await renderPage(TEACHER, results("DRAFT", [student("e1", "Hodan", 1, { marksObtained: "60", percentage: 120, hasMark: true }), AMINA()]));

    const box = screen.getByLabelText("Mark for Hodan Test");
    expect(box).toHaveAttribute("aria-invalid", "true");
    expect(within(box.parentElement as HTMLElement).getByRole("alert")).toHaveTextContent("Above the maximum of 50");
    expect(screen.getByRole("button", { name: "Save Draft" })).toBeDisabled();
  });

  it("a blank mark is Missing, not an error, and an Absent student's row is never validated as a mark", async () => {
    await renderPage(TEACHER, results("DRAFT", [AMINA(), student("e3", "Hassan", 3, { isAbsent: true })]));

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save Draft" })).toBeEnabled();
  });

  it("shows the server's own validation message exactly as returned, naming the student", async () => {
    const user = userEvent.setup();
    apiMock.enterMarks.mockRejectedValue(new ApiError("Hodan Test (#1): 45 is above the maximum of 40", 400));
    await renderPage(TEACHER, results("DRAFT", [HODAN()]));

    await user.clear(screen.getByLabelText("Mark for Hodan Test"));
    await user.type(screen.getByLabelText("Mark for Hodan Test"), "45");
    await user.click(screen.getByRole("button", { name: "Save Draft" }));

    expect(await screen.findByText("Hodan Test (#1): 45 is above the maximum of 40")).toBeInTheDocument();
  });

  it("an admin is held to the same rule as a teacher", async () => {
    const user = userEvent.setup();
    await renderPage(ADMIN, results("NEEDS_CORRECTION", [HODAN()]));

    await user.clear(screen.getByLabelText("Mark for Hodan Test"));
    await user.type(screen.getByLabelText("Mark for Hodan Test"), "75");

    expect(screen.getByRole("button", { name: "Save Draft" })).toBeDisabled();
  });
});

describe("Results page - Submit for Review dialog", () => {
  it("shows the exam context and Students / Completed marks / Absent / Missing marks (which add up)", async () => {
    const user = userEvent.setup();
    const data = withContext(
      results("DRAFT", [HODAN(), student("e2", "Amina", 2, { isAbsent: true }), student("e4", "Bilan", 4, { marksObtained: "30", percentage: 60, hasMark: true })]),
      { termName: "Term 1", passingMark: 20, examDate: "2027-03-01T00:00:00.000Z" },
    );
    apiMock.enterMarks.mockResolvedValue(data);
    await renderPage(TEACHER, data);

    await user.click(screen.getByRole("button", { name: "Submit for Review" }));
    const dialog = await screen.findByRole("alertdialog");

    const cell = (label: string) => within(dialog).getByText(label).nextElementSibling?.textContent;
    expect(cell("Exam Name")).toBe("Term 2 Exam");
    expect(cell("Subject")).toBe("Mathematics");
    expect(cell("Class")).toBe("Form 2");
    expect(cell("Section")).toBe("A");
    expect(cell("Academic Year")).toBe("2026-2027");
    expect(cell("Term")).toBe("Term 1");
    expect(cell("Maximum Marks")).toBe("50");
    expect(cell("Pass Mark")).toBe("20");
    expect(cell("Students")).toBe("3");
    expect(cell("Completed marks")).toBe("2");
    expect(cell("Absent")).toBe("1");
    expect(cell("Missing marks")).toBe("0");
  });

  it("missing marks block submission and are counted separately from absent", async () => {
    const user = userEvent.setup();
    const data = results("DRAFT", [HODAN(), AMINA(), student("e3", "Hassan", 3, { isAbsent: true })]);
    apiMock.enterMarks.mockResolvedValue(data);
    await renderPage(TEACHER, data);

    await user.click(screen.getByRole("button", { name: "Submit for Review" }));
    const dialog = await screen.findByRole("alertdialog");

    const cell = (label: string) => within(dialog).getByText(label).nextElementSibling?.textContent;
    expect(cell("Completed marks")).toBe("1");
    expect(cell("Absent")).toBe("1");
    expect(cell("Missing marks")).toBe("1");
    expect(within(dialog).getByRole("button", { name: "Submit for Review" })).toBeDisabled();
  });
});
