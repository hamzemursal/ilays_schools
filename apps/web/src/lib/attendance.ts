import type { AttendanceSession, AttendanceStatus, MyChildAttendanceRecord } from "./api";

// Groups a flat list of per-session Attendance records (see
// MyChildAttendanceRecord) into one row per calendar day, with each
// session's own status kept separate — the Parent/Student Portal's whole
// point is showing Morning and Afternoon side by side, never collapsed into
// one misleading daily value. A session with no record for that day is
// `null` here, which callers must render as "Not Recorded", never as
// "Absent" — those are genuinely different facts.
export interface DayAttendance {
  date: string;
  className: string;
  sectionName: string;
  sessions: Partial<Record<AttendanceSession, { status: AttendanceStatus; note: string | null; markedByName?: string | null }>>;
}

export function groupAttendanceByDate(records: MyChildAttendanceRecord[]): DayAttendance[] {
  const byDate = new Map<string, DayAttendance>();

  for (const r of records) {
    const key = new Date(r.date).toISOString().slice(0, 10);
    let day = byDate.get(key);
    if (!day) {
      day = { date: r.date, className: r.className, sectionName: r.sectionName, sessions: {} };
      byDate.set(key, day);
    }
    day.sessions[r.session] = { status: r.status, note: r.note, markedByName: r.markedByName };
  }

  return [...byDate.values()].sort((a, b) => (a.date < b.date ? 1 : -1));
}
