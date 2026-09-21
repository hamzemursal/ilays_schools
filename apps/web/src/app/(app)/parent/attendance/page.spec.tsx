import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import type { MyChildAcademicYear, MyChildAttendance, MyChildAttendanceRecord, MyChildSubject } from "@/lib/api";
import ParentAttendancePage from "./page";

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
  getMyChildAcademicYears: vi.fn(),
  getMyChildAttendance: vi.fn(),
  getMyChildSubjects: vi.fn(),
}));
vi.mock("@/lib/api", () => ({ api: apiMock }));

const YEAR: MyChildAcademicYear = { id: "year-1", name: "2027", isCurrent: true, hasAttendance: true };

function record(overrides: Partial<MyChildAttendanceRecord> = {}): MyChildAttendanceRecord {
  return {
    id: "rec-1",
    date: "2026-09-12T00:00:00.000Z",
    session: "MORNING",
    status: "PRESENT",
    note: null,
    className: "Class 1",
    sectionName: "A",
    ...overrides,
  };
}

function attendance(records: MyChildAttendanceRecord[]): MyChildAttendance {
  const total = records.length;
  const present = records.filter((r) => r.status === "PRESENT").length;
  const absent = records.filter((r) => r.status === "ABSENT").length;
  return {
    summary: { total, present, absent, late: 0, excused: 0, percentage: total > 0 ? Math.round((present / total) * 1000) / 10 : null },
    records,
  };
}

const SUBJECTS: MyChildSubject[] = [];

beforeEach(() => {
  vi.clearAllMocks();
  useAuthMock.mockReturnValue({ accessToken: "token-1" });
  useSelectedChildMock.mockReturnValue({
    selectedChild: { studentId: "stu-1" },
    loading: false,
    children: [{ studentId: "stu-1" }],
  });
  apiMock.getMyChildAcademicYears.mockResolvedValue([YEAR]);
  apiMock.getMyChildSubjects.mockResolvedValue(SUBJECTS);
});

describe("ParentAttendancePage — two-session rendering", () => {
  it("shows both sessions separately for the same day: Present in the morning, Absent in the afternoon", async () => {
    apiMock.getMyChildAttendance.mockResolvedValue(
      attendance([
        record({ id: "r1", session: "MORNING", status: "PRESENT" }),
        record({ id: "r2", session: "AFTERNOON", status: "ABSENT" }),
      ]),
    );
    render(<ParentAttendancePage />);

    // "Present" is ambiguous with the summary StatCard's own label above the
    // table — scope to the row via its Class/Section cell instead.
    const row = (await screen.findByText("Class 1 · A")).closest("tr")!;
    expect(within(row).getByText("PRESENT")).toBeInTheDocument();
    expect(within(row).getByText("ABSENT")).toBeInTheDocument();
  });

  it("shows 'Not Recorded' for the afternoon when only the morning session has been marked — never as Absent", async () => {
    apiMock.getMyChildAttendance.mockResolvedValue(attendance([record({ session: "MORNING", status: "PRESENT" })]));
    render(<ParentAttendancePage />);

    const row = (await screen.findByText("Class 1 · A")).closest("tr")!;
    expect(within(row).getByText("Not Recorded")).toBeInTheDocument();
    expect(within(row).queryByText("ABSENT")).not.toBeInTheDocument();
  });

  it("shows both sessions Present on a fully-attended day", async () => {
    apiMock.getMyChildAttendance.mockResolvedValue(
      attendance([
        record({ id: "r1", session: "MORNING", status: "PRESENT" }),
        record({ id: "r2", session: "AFTERNOON", status: "PRESENT" }),
      ]),
    );
    render(<ParentAttendancePage />);

    const row = (await screen.findByText("Class 1 · A")).closest("tr")!;
    expect(within(row).getAllByText("PRESENT")).toHaveLength(2);
  });

  it("groups two same-day session records into a single row, not two", async () => {
    apiMock.getMyChildAttendance.mockResolvedValue(
      attendance([
        record({ id: "r1", date: "2026-09-12T00:00:00.000Z", session: "MORNING" }),
        record({ id: "r2", date: "2026-09-12T00:00:00.000Z", session: "AFTERNOON" }),
      ]),
    );
    render(<ParentAttendancePage />);

    await screen.findByText("1 day(s) recorded this year.");
  });

  it("shows an empty state when nothing has been recorded", async () => {
    apiMock.getMyChildAttendance.mockResolvedValue(attendance([]));
    render(<ParentAttendancePage />);
    expect(await screen.findByText("No attendance records found for this year")).toBeInTheDocument();
  });
});

// Cells in a Daily attendance row: Date, Day, Class / Section, Morning, Afternoon.
function sessionCells(row: HTMLElement) {
  const cells = within(row).getAllByRole("cell");
  return { morning: cells[3], afternoon: cells[4] };
}

describe("ParentAttendancePage — every Morning / Afternoon combination stays distinguishable", () => {
  const day = (id: string, date: string, session: "MORNING" | "AFTERNOON", status: MyChildAttendanceRecord["status"]) =>
    record({ id, date: `${date}T00:00:00.000Z`, session, status });

  it("Present / Present, Present / Absent, Absent / Present and Present / Not Recorded each render in their own column", async () => {
    apiMock.getMyChildAttendance.mockResolvedValue(
      attendance([
        day("a1", "2026-09-14", "MORNING", "PRESENT"),
        day("a2", "2026-09-14", "AFTERNOON", "PRESENT"),
        day("b1", "2026-09-15", "MORNING", "PRESENT"),
        day("b2", "2026-09-15", "AFTERNOON", "ABSENT"),
        day("c1", "2026-09-16", "MORNING", "ABSENT"),
        day("c2", "2026-09-16", "AFTERNOON", "PRESENT"),
        day("d1", "2026-09-17", "MORNING", "PRESENT"),
      ]),
    );
    render(<ParentAttendancePage />);

    await screen.findByText("4 day(s) recorded this year.");
    const rows = screen.getAllByText("Class 1 · A").map((c) => c.closest("tr")!);
    // Newest date first.
    const [notRecorded, absentPresent, presentAbsent, presentPresent] = rows.map(sessionCells);

    expect(presentPresent.morning).toHaveTextContent("PRESENT");
    expect(presentPresent.afternoon).toHaveTextContent("PRESENT");

    expect(presentAbsent.morning).toHaveTextContent("PRESENT");
    expect(presentAbsent.afternoon).toHaveTextContent("ABSENT");

    expect(absentPresent.morning).toHaveTextContent("ABSENT");
    expect(absentPresent.afternoon).toHaveTextContent("PRESENT");

    expect(notRecorded.morning).toHaveTextContent("PRESENT");
    expect(notRecorded.afternoon).toHaveTextContent("Not Recorded");
    expect(notRecorded.afternoon).not.toHaveTextContent("ABSENT");
  });

  it("a morning that was never recorded is Not Recorded (not Absent) even when the afternoon was marked", async () => {
    apiMock.getMyChildAttendance.mockResolvedValue(attendance([day("e2", "2026-09-18", "AFTERNOON", "PRESENT")]));
    render(<ParentAttendancePage />);

    const { morning, afternoon } = sessionCells((await screen.findByText("Class 1 · A")).closest("tr")!);

    expect(morning).toHaveTextContent("Not Recorded");
    expect(morning).not.toHaveTextContent("ABSENT");
    expect(afternoon).toHaveTextContent("PRESENT");
  });

  it("explains that Not Recorded is not Absent, and labels the summary count as sessions rather than days", async () => {
    apiMock.getMyChildAttendance.mockResolvedValue(attendance([day("f1", "2026-09-19", "MORNING", "PRESENT")]));
    render(<ParentAttendancePage />);

    expect(await screen.findByText(/never\s+counted as Absent/)).toBeInTheDocument();
    expect(screen.queryByText("Total days")).not.toBeInTheDocument();
  });

  it("asks for the selected academic year only", async () => {
    apiMock.getMyChildAttendance.mockResolvedValue(attendance([day("g1", "2026-09-20", "MORNING", "PRESENT")]));
    render(<ParentAttendancePage />);

    await screen.findByText("Class 1 · A");
    expect(apiMock.getMyChildAttendance).toHaveBeenCalledWith("token-1", "stu-1", "year-1");
  });
});
