// The Advanced Student List's OPTIONAL column registry — the core columns
// (Photo, Student Name, Student ID, Roll Number, Gender, Class/Section,
// Attendance, Actions) are always rendered by StudentsTable and never appear
// here, matching the approved design's "core student information is always
// visible and cannot be hidden" rule. Every id below maps to a real field
// the backend actually returns (see StudentDirectoryItem in @/lib/api and
// DIRECTORY_COLUMNS on the API side) — nothing here is invented.

export type ColumnCategory = "STUDENT" | "PARENT" | "FEES" | "ATTENDANCE" | "ACADEMIC";

export interface ColumnDef {
  id: string;
  label: string;
  category: ColumnCategory;
  // Parent Profile is UI-only — a link, not a value — so it's excluded from
  // export; everything else here has a real CSV cell.
  exportable: boolean;
}

export const CATEGORY_LABELS: Record<ColumnCategory, string> = {
  STUDENT: "Student Information",
  PARENT: "Parent / Guardian",
  FEES: "Fees & Payments",
  ATTENDANCE: "Attendance",
  ACADEMIC: "Academic",
};

export const COLUMN_DEFS: ColumnDef[] = [
  { id: "dateOfBirth", label: "Date of Birth", category: "STUDENT", exportable: true },
  { id: "admissionDate", label: "Admission Date", category: "STUDENT", exportable: true },
  { id: "status", label: "Status", category: "STUDENT", exportable: true },

  { id: "parentName", label: "Parent Name", category: "PARENT", exportable: true },
  { id: "parentContact", label: "Parent Contact", category: "PARENT", exportable: true },
  { id: "relationship", label: "Relationship", category: "PARENT", exportable: true },
  { id: "parentProfile", label: "Parent Profile", category: "PARENT", exportable: false },

  { id: "feeStatus", label: "Fee Status", category: "FEES", exportable: true },
  { id: "totalFees", label: "Total Fees", category: "FEES", exportable: true },
  { id: "amountPaid", label: "Amount Paid", category: "FEES", exportable: true },
  { id: "amountDue", label: "Amount Due", category: "FEES", exportable: true },
  { id: "lastPayment", label: "Last Payment", category: "FEES", exportable: true },

  // Distinct from the always-visible combined Attendance cell (which shows
  // both sessions at once) — these are single-session columns, mainly
  // useful for sorting or exporting one session's status on its own.
  { id: "attendanceMorning", label: "Morning Session", category: "ATTENDANCE", exportable: true },
  { id: "attendanceAfternoon", label: "Afternoon Session", category: "ATTENDANCE", exportable: true },

  { id: "academicYear", label: "Academic Year", category: "ACADEMIC", exportable: false },
];

// Every column id a viewer is allowed to toggle on — used by "Show All".
export const ALL_OPTIONAL_COLUMN_IDS = COLUMN_DEFS.map((c) => c.id);

// The approved default view shows ONLY the always-on core columns — no
// optional column is checked out of the box; "Default" in the UI resets to
// this same empty selection.
export const DEFAULT_VISIBLE_COLUMNS: string[] = [];

// Core columns that always appear on screen and are exportable (Photo and
// Actions are UI-only and have no CSV cell) — always prepended to whatever
// optional columns are selected when building an export request, so the
// exported file matches what the admin is actually looking at.
export const CORE_EXPORTABLE_COLUMN_IDS = ["name", "studentId", "rollNumber", "gender", "class", "section", "attendanceToday"];

const STORAGE_KEY = "ilays.studentDirectory.columns.v1";

// Per-browser, per-admin persistence — this app has no user-preferences
// table, and adding one purely to remember a column layout would be a
// schema change for a "nice to have". localStorage is the existing,
// zero-schema-risk mechanism for exactly this kind of per-viewer setting.
export function loadColumnPrefs(): string[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_VISIBLE_COLUMNS;
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return DEFAULT_VISIBLE_COLUMNS;
    const validIds = new Set(COLUMN_DEFS.map((c) => c.id));
    return parsed.filter((id): id is string => typeof id === "string" && validIds.has(id));
  } catch {
    return DEFAULT_VISIBLE_COLUMNS;
  }
}

export function saveColumnPrefs(ids: string[]): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
  } catch {
    // Private browsing / storage disabled — the choice just won't persist
    // across visits, which is fine; it still works for this session.
  }
}
