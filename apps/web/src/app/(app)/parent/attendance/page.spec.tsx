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
