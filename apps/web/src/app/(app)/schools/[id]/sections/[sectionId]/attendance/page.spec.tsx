import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ToastProvider } from "@/components/ui/Toast";
import type { AttendanceRow } from "@/lib/api";
import AttendancePage from "./page";

// AttendancePage reads its route params via React's use(params). A plain
// `Promise.resolve(...)` still suspends on first render (use() can't
// synchronously know a native promise's settled state), and jsdom/vitest
// doesn't reliably schedule the retry. Pre-marking the promise fulfilled is
// the documented escape hatch React's own `use()` implementation checks for
// (the same shape it internally attaches to a thenable it has already
// resolved once) — it lets every test render synchronously instead of
// fighting Suspense timing.
function fulfilledPromise<T>(value: T): Promise<T> {
  const p = Promise.resolve(value) as Promise<T> & { status?: string; value?: T };
  p.status = "fulfilled";
  p.value = value;
  return p;
}

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
vi.mock("@/lib/auth-context", () => ({
  useAuth: () => useAuthMock(),
  ApiError,
}));

const apiMock = vi.hoisted(() => ({
  getAttendance: vi.fn(),
  markAttendance: vi.fn(),
  saveAttendanceDraft: vi.fn(),
}));
vi.mock("@/lib/api", () => ({ api: apiMock }));

const routerPush = vi.hoisted(() => vi.fn());
const searchParamsHolder = vi.hoisted(() => ({ current: new URLSearchParams() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: routerPush }),
  useSearchParams: () => searchParamsHolder.current,
}));

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: React.ComponentProps<"a"> & { href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

const ADMIN_USER = { permissions: ["students.view"] };
const TEACHER_NO_PROFILE_ACCESS = { permissions: [] };

function row(overrides: Partial<AttendanceRow> = {}): AttendanceRow {
  return {
    enrollmentId: "enr-1",
    studentId: "student-1",
    firstName: "Amina",
    lastName: "Yusuf",
    rollNumber: 1,
    status: null,
    note: null,
    isDraft: false,
    photoUrl: null,
    ...overrides,
  };
}

function renderPage() {
  return render(
    <ToastProvider>
      <AttendancePage params={fulfilledPromise({ id: "school-1", sectionId: "section-1" })} />
    </ToastProvider>,
  );
}

// Simulates a sidebar/breadcrumb link sitting alongside the page, so the
// in-app click-interception logic (document-level listener) has a real
// same-origin anchor to intercept.
function renderPageWithSiblingLink() {
  return render(
    <ToastProvider>
      <div>
        <a href="/my-classes">Back to my classes</a>
        <AttendancePage params={fulfilledPromise({ id: "school-1", sectionId: "section-1" })} />
      </div>
    </ToastProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  searchParamsHolder.current = new URLSearchParams();
  useAuthMock.mockReturnValue({ user: ADMIN_USER, accessToken: "token-1" });
  apiMock.getAttendance.mockResolvedValue([]);
});

describe("AttendancePage — loading/error/empty states", () => {
  it("shows a loading skeleton before the attendance list resolves", async () => {
    let resolve!: (rows: AttendanceRow[]) => void;
    apiMock.getAttendance.mockReturnValue(new Promise((r) => (resolve = r)));

    renderPage();

    expect(screen.queryByText("No active students")).not.toBeInTheDocument();
    resolve([]);
    await waitFor(() => expect(screen.getByText("No active students")).toBeInTheDocument());
  });

  it("shows an EmptyState when the section has no active students", async () => {
    apiMock.getAttendance.mockResolvedValue([]);
    renderPage();
    expect(await screen.findByText("No active students")).toBeInTheDocument();
  });

  it("shows the ApiError's own message in an Alert when loading fails", async () => {
    apiMock.getAttendance.mockRejectedValue(new ApiError("Section not found in this school"));
    renderPage();
    expect(await screen.findByText("Section not found in this school")).toBeInTheDocument();
  });

  it("shows a generic fallback message when loading fails with a non-ApiError", async () => {
    apiMock.getAttendance.mockRejectedValue(new Error("network down"));
    renderPage();
    expect(await screen.findByText("Failed to load attendance")).toBeInTheDocument();
  });

  it("defaults every student with no prior mark to PRESENT, not blank", async () => {
    apiMock.getAttendance.mockResolvedValue([row({ status: null })]);
    renderPage();
    await screen.findByText("Yusuf", { exact: false });

    const presentButton = screen.getByRole("button", { name: "Present" });
    expect(presentButton.className).toMatch(/bg-success/);
  });

  it("shows the draft banner when the loaded day was left as a draft", async () => {
    apiMock.getAttendance.mockResolvedValue([row({ isDraft: true, status: "ABSENT" })]);
    renderPage();
    expect(await screen.findByText(/left as a draft/)).toBeInTheDocument();
  });
});

describe("AttendancePage — RBAC on the student identity link", () => {
  it("links to the student's profile when the actor has students.view", async () => {
    useAuthMock.mockReturnValue({ user: ADMIN_USER, accessToken: "token-1" });
    apiMock.getAttendance.mockResolvedValue([row()]);
    renderPage();

    const link = await screen.findByRole("link", { name: /Yusuf/ });
    expect(link).toHaveAttribute("href", "/schools/school-1/students/student-1");
  });

  it("renders no profile link at all when the actor lacks students.view", async () => {
    useAuthMock.mockReturnValue({ user: TEACHER_NO_PROFILE_ACCESS, accessToken: "token-1" });
    apiMock.getAttendance.mockResolvedValue([row()]);
    renderPage();

    await screen.findByText("Yusuf", { exact: false });
    expect(screen.queryByRole("link", { name: /Yusuf/ })).not.toBeInTheDocument();
  });
});

describe("AttendancePage — marking and saving", () => {
  it("changing one student's status and saving sends only that entry's new status", async () => {
    const user = userEvent.setup();
    apiMock.getAttendance.mockResolvedValue([row({ enrollmentId: "enr-1", status: "PRESENT" })]);
    apiMock.markAttendance.mockResolvedValue([row({ enrollmentId: "enr-1", status: "ABSENT" })]);
    renderPage();
    await screen.findByText("Yusuf", { exact: false });

    await user.click(screen.getByRole("button", { name: "Absent" }));
    await user.click(screen.getByRole("button", { name: "Save attendance" }));

    await waitFor(() =>
      expect(apiMock.markAttendance).toHaveBeenCalledWith(
        "token-1",
        "school-1",
        "section-1",
        expect.any(String),
        [{ enrollmentId: "enr-1", status: "ABSENT" }],
      ),
    );
  });

  it("shows the finalized confirmation message and a success toast after a successful save", async () => {
    const user = userEvent.setup();
    apiMock.getAttendance.mockResolvedValue([row()]);
    apiMock.markAttendance.mockResolvedValue([row()]);
    renderPage();
    await screen.findByText("Yusuf", { exact: false });

    await user.click(screen.getByRole("button", { name: "Save attendance" }));

    expect(await screen.findByText(/Saved — 1 student\(s\) recorded/)).toBeInTheDocument();
    expect(await screen.findByText("Attendance saved.")).toBeInTheDocument();
  });

  it("shows an inline error alert (not a toast) when the final save fails", async () => {
    const user = userEvent.setup();
    apiMock.getAttendance.mockResolvedValue([row()]);
    apiMock.markAttendance.mockRejectedValue(new ApiError("Cannot mark attendance for a future date"));
    renderPage();
    await screen.findByText("Yusuf", { exact: false });

    await user.click(screen.getByRole("button", { name: "Save attendance" }));

    expect(await screen.findByText("Cannot mark attendance for a future date")).toBeInTheDocument();
  });

  it("'Mark all Present' resets every student's pending status to Present, including ones already changed", async () => {
    const user = userEvent.setup();
    apiMock.getAttendance.mockResolvedValue([
      row({ enrollmentId: "enr-1", firstName: "Amina", status: "PRESENT" }),
      row({ enrollmentId: "enr-2", firstName: "Bashir", lastName: "Ali", status: "ABSENT" }),
    ]);
    apiMock.markAttendance.mockResolvedValue([]);
    renderPage();
    await screen.findByText("Amina", { exact: false });

    await user.click(screen.getByRole("button", { name: "Mark all Present" }));
    await user.click(screen.getByRole("button", { name: "Save attendance" }));

    await waitFor(() =>
      expect(apiMock.markAttendance).toHaveBeenCalledWith(
        "token-1",
        "school-1",
        "section-1",
        expect.any(String),
        expect.arrayContaining([
          { enrollmentId: "enr-1", status: "PRESENT" },
          { enrollmentId: "enr-2", status: "PRESENT" },
        ]),
      ),
    );
  });

  it("saving as a draft calls saveAttendanceDraft (not markAttendance) and shows the draft confirmation", async () => {
    const user = userEvent.setup();
    apiMock.getAttendance.mockResolvedValue([row({ status: "PRESENT" })]);
    apiMock.saveAttendanceDraft.mockResolvedValue([row({ status: "ABSENT", isDraft: true })]);
    renderPage();
    await screen.findByText("Yusuf", { exact: false });

    await user.click(screen.getByRole("button", { name: "Absent" }));
    await user.click(screen.getByRole("button", { name: "Save as draft" }));

    expect(apiMock.markAttendance).not.toHaveBeenCalled();
    await waitFor(() => expect(apiMock.saveAttendanceDraft).toHaveBeenCalled());
    expect(await screen.findByText("Saved as draft — not final yet.")).toBeInTheDocument();
  });
});

describe("AttendancePage — unsaved-changes protection", () => {
  it("intercepts an in-app navigation click while dirty and opens the three-way dialog instead of navigating", async () => {
    const user = userEvent.setup();
    apiMock.getAttendance.mockResolvedValue([row({ status: "PRESENT" })]);
    renderPageWithSiblingLink();
    await screen.findByText("Yusuf", { exact: false });

    await user.click(screen.getByRole("button", { name: "Absent" })); // makes it dirty
    await user.click(screen.getByRole("link", { name: "Back to my classes" }));

    expect(await screen.findByRole("alertdialog")).toBeInTheDocument();
    expect(routerPush).not.toHaveBeenCalled();
  });

  it("never intercepts navigation clicks while there are no unsaved changes", async () => {
    const user = userEvent.setup();
    apiMock.getAttendance.mockResolvedValue([row({ status: "PRESENT" })]);
    renderPageWithSiblingLink();
    await screen.findByText("Yusuf", { exact: false });

    await user.click(screen.getByRole("link", { name: "Back to my classes" }));

    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("'Discard changes & leave' runs the held navigation and closes the dialog", async () => {
    const user = userEvent.setup();
    apiMock.getAttendance.mockResolvedValue([row({ status: "PRESENT" })]);
    renderPageWithSiblingLink();
    await screen.findByText("Yusuf", { exact: false });
    await user.click(screen.getByRole("button", { name: "Absent" }));
    await user.click(screen.getByRole("link", { name: "Back to my classes" }));
    const dialog = await screen.findByRole("alertdialog");

    await user.click(within(dialog).getByRole("button", { name: /Discard changes/ }));

    expect(routerPush).toHaveBeenCalledWith("/my-classes");
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("'Save as draft & leave' from the dialog saves the draft then runs the held navigation", async () => {
    const user = userEvent.setup();
    apiMock.getAttendance.mockResolvedValue([row({ status: "PRESENT" })]);
    apiMock.saveAttendanceDraft.mockResolvedValue([row({ status: "ABSENT", isDraft: true })]);
    renderPageWithSiblingLink();
    await screen.findByText("Yusuf", { exact: false });
    await user.click(screen.getByRole("button", { name: "Absent" }));
    await user.click(screen.getByRole("link", { name: "Back to my classes" }));
    const dialog = await screen.findByRole("alertdialog");

    await user.click(within(dialog).getByRole("button", { name: /Save as draft/ }));

    await waitFor(() => expect(apiMock.saveAttendanceDraft).toHaveBeenCalled());
    await waitFor(() => expect(routerPush).toHaveBeenCalledWith("/my-classes"));
  });

  it("'Keep editing' closes the dialog without navigating or saving", async () => {
    const user = userEvent.setup();
    apiMock.getAttendance.mockResolvedValue([row({ status: "PRESENT" })]);
    renderPageWithSiblingLink();
    await screen.findByText("Yusuf", { exact: false });
    await user.click(screen.getByRole("button", { name: "Absent" }));
    await user.click(screen.getByRole("link", { name: "Back to my classes" }));
    const dialog = await screen.findByRole("alertdialog");

    await user.click(within(dialog).getByRole("button", { name: "Keep editing" }));

    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(routerPush).not.toHaveBeenCalled();
    expect(apiMock.saveAttendanceDraft).not.toHaveBeenCalled();
  });

  it("prevents the native beforeunload only while dirty", async () => {
    const user = userEvent.setup();
    apiMock.getAttendance.mockResolvedValue([row({ status: "PRESENT" })]);
    renderPage();
    await screen.findByText("Yusuf", { exact: false });

    const cleanEvent = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(cleanEvent);
    expect(cleanEvent.defaultPrevented).toBe(false);

    await user.click(screen.getByRole("button", { name: "Absent" }));

    const dirtyEvent = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(dirtyEvent);
    expect(dirtyEvent.defaultPrevented).toBe(true);
  });
});
