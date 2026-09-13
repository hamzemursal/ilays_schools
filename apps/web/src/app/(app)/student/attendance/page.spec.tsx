import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import type { MyChildAcademicYear, MyChildAttendance, MyChildAttendanceRecord } from "@/lib/api";
import StudentAttendancePage from "./page";

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
  getMyStudentAttendance: vi.fn(),
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
    markedByName: "Amran Hassan",
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

beforeEach(() => {
  vi.clearAllMocks();
  useAuthMock.mockReturnValue({ accessToken: "token-1" });
  apiMock.getMyStudentAcademicYears.mockResolvedValue([YEAR]);
});

describe("StudentAttendancePage — two-session rendering", () => {
  it("shows both sessions separately for the same day", async () => {
    apiMock.getMyStudentAttendance.mockResolvedValue(
      attendance([
        record({ id: "r1", session: "MORNING", status: "PRESENT" }),
        record({ id: "r2", session: "AFTERNOON", status: "ABSENT" }),
      ]),
    );
    render(<StudentAttendancePage />);

    const row = (await screen.findByText("Class 1 · A")).closest("tr")!;
    expect(within(row).getByText("PRESENT")).toBeInTheDocument();
    expect(within(row).getByText("ABSENT")).toBeInTheDocument();
  });

  it("shows 'Not Recorded' for a session with no record, not Absent", async () => {
    apiMock.getMyStudentAttendance.mockResolvedValue(attendance([record({ session: "MORNING", status: "PRESENT" })]));
    render(<StudentAttendancePage />);

    const row = (await screen.findByText("Class 1 · A")).closest("tr")!;
    expect(within(row).getByText("Not Recorded")).toBeInTheDocument();
    expect(within(row).queryByText("ABSENT")).not.toBeInTheDocument();
  });

  it("shows each session's own marker", async () => {
    apiMock.getMyStudentAttendance.mockResolvedValue(
      attendance([
        record({ id: "r1", session: "MORNING", markedByName: "Amran Hassan" }),
        record({ id: "r2", session: "AFTERNOON", markedByName: "Fadumo Warsame" }),
      ]),
    );
    render(<StudentAttendancePage />);

    const row = (await screen.findByText("Class 1 · A")).closest("tr")!;
    expect(within(row).getByText("by Amran Hassan")).toBeInTheDocument();
    expect(within(row).getByText("by Fadumo Warsame")).toBeInTheDocument();
  });

  it("groups two same-day session records into one row", async () => {
    apiMock.getMyStudentAttendance.mockResolvedValue(
      attendance([
        record({ id: "r1", date: "2026-09-12T00:00:00.000Z", session: "MORNING" }),
        record({ id: "r2", date: "2026-09-12T00:00:00.000Z", session: "AFTERNOON" }),
      ]),
    );
    render(<StudentAttendancePage />);

    await screen.findByText("1 day(s) recorded this year.");
  });

  it("shows an empty state when nothing has been recorded", async () => {
    apiMock.getMyStudentAttendance.mockResolvedValue(attendance([]));
    render(<StudentAttendancePage />);
    expect(await screen.findByText("No attendance records found for this academic year")).toBeInTheDocument();
  });
});
