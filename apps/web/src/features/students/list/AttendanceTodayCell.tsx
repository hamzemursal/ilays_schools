"use client";

import { useEffect, useRef, useState } from "react";
import type { AttendanceSession, AttendanceStatus } from "@/lib/api";

const STATUS_DOT: Record<AttendanceStatus, string> = {
  PRESENT: "bg-success",
  ABSENT: "bg-danger",
  LATE: "bg-warning",
  EXCUSED: "bg-accent",
};
const STATUS_LABEL: Record<AttendanceStatus, string> = {
  PRESENT: "Present",
  ABSENT: "Absent",
  LATE: "Late",
  EXCUSED: "Excused",
};

// Not Recorded is a real, distinct state — rendered as a plain outline dot
// with muted text, never colored like Absent and never merged with it.
function SessionPill({ label, status }: { label: string; status: AttendanceStatus | null }) {
  return (
    <span className="inline-flex items-center gap-1 text-xs">
      <span
        className={`size-1.5 rounded-full ${status ? STATUS_DOT[status] : "border border-foreground-muted bg-transparent"}`}
      />
      <span className={status ? "text-foreground" : "text-foreground-muted"}>
        {label} {status ? STATUS_LABEL[status] : "Not Recorded"}
      </span>
    </span>
  );
}

// Compact "AM ✓  PM ○" cell for the Advanced Student List. Clicking opens a
// small popover with both sessions' full status — the row itself never
// needs to grow to show both at once.
export function AttendanceTodayCell({ attendance }: { attendance: Record<AttendanceSession, AttendanceStatus | null> }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  return (
    <div ref={ref} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Attendance today — click for both sessions"
        className="flex flex-col items-start gap-0.5 rounded-lg px-1.5 py-1 hover:bg-surface-hover"
      >
        <SessionPill label="AM" status={attendance.MORNING} />
        <SessionPill label="PM" status={attendance.AFTERNOON} />
      </button>
      {open && (
        <div
          role="dialog"
          aria-label="Attendance today, both sessions"
          className="absolute left-0 z-10 mt-1 w-52 rounded-lg border border-border bg-background p-3 shadow-lg"
        >
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-foreground-muted">Today's attendance</p>
          <div className="space-y-1.5">
            <SessionPill label="Morning Session —" status={attendance.MORNING} />
            <SessionPill label="Afternoon Session —" status={attendance.AFTERNOON} />
          </div>
        </div>
      )}
    </div>
  );
}
