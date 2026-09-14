import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { AttendanceSession, AttendanceStatus } from "@/lib/api";
import { AttendanceTodayCell } from "./AttendanceTodayCell";

function attendance(morning: AttendanceStatus | null, afternoon: AttendanceStatus | null): Record<AttendanceSession, AttendanceStatus | null> {
  return { MORNING: morning, AFTERNOON: afternoon };
}

describe("AttendanceTodayCell — compact pills", () => {
  it("shows AM and PM labels, never 'First Half'/'Second Half'", () => {
    render(<AttendanceTodayCell attendance={attendance("PRESENT", "ABSENT")} />);
    expect(screen.getByText(/^AM/)).toBeInTheDocument();
    expect(screen.getByText(/^PM/)).toBeInTheDocument();
    expect(screen.queryByText(/First Half/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Second Half/)).not.toBeInTheDocument();
  });

  it("renders 'Not Recorded' for a null session, and never labels it Absent", () => {
    render(<AttendanceTodayCell attendance={attendance(null, "PRESENT")} />);
    expect(screen.getByText(/AM.*Not Recorded/)).toBeInTheDocument();
    expect(screen.queryByText(/AM.*Absent/)).not.toBeInTheDocument();
  });

  it.each([
    ["PRESENT", "Present"],
    ["ABSENT", "Absent"],
    ["LATE", "Late"],
    ["EXCUSED", "Excused"],
  ] as const)("labels a %s morning session as %s", (status, label) => {
    render(<AttendanceTodayCell attendance={attendance(status, null)} />);
    expect(screen.getByText(new RegExp(`AM.*${label}`))).toBeInTheDocument();
  });
});

describe("AttendanceTodayCell — popover", () => {
  it("is closed by default", () => {
    render(<AttendanceTodayCell attendance={attendance("PRESENT", "PRESENT")} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("opens on click and shows both full session labels", async () => {
    const user = userEvent.setup();
    render(<AttendanceTodayCell attendance={attendance("PRESENT", null)} />);
    await user.click(screen.getByRole("button", { name: /Attendance today/ }));
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent("Morning Session");
    expect(dialog).toHaveTextContent("Afternoon Session");
    expect(dialog).toHaveTextContent("Not Recorded");
  });

  it("closes when clicking outside", async () => {
    const user = userEvent.setup();
    render(
      <div>
        <AttendanceTodayCell attendance={attendance("PRESENT", "PRESENT")} />
        <button type="button">outside</button>
      </div>,
    );
    await user.click(screen.getByRole("button", { name: /Attendance today/ }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "outside" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
