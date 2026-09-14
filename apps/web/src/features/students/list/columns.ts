// The Advanced Student List's column registry — one shared vocabulary of
// column ids used by ChooseColumnsPanel, StudentsTable, and export. Every id
// here maps to a real field the backend actually returns (see
// StudentDirectoryItem in @/lib/api and DIRECTORY_COLUMNS on the API side).
// "Alternative Contact" and "Academic Performance" are deliberately absent —
// no such Guardian field or results-aggregation exists yet; inventing either
// would violate the "only real data" rule this feature was built under.

export type ColumnCategory = "STUDENT" | "ACADEMIC" | "FINANCE" | "PARENT";

export interface ColumnDef {
  id: string;
  label: string;
  category: ColumnCategory;
  // Some columns (Photo, Parent Profile) are UI-only — an image or a link —
  // and have no meaningful CSV cell, so they're excluded from export.
  exportable: boolean;
}

export const CATEGORY_LABELS: Record<ColumnCategory, string> = {
  STUDENT: "Student",
  ACADEMIC: "Academic",
  FINANCE: "Finance",
  PARENT: "Parent / Guardian",
};

export const COLUMN_DEFS: ColumnDef[] = [
  { id: "photo", label: "Student Photo", category: "STUDENT", exportable: false },
  { id: "name", label: "Student Name", category: "STUDENT", exportable: true },
  { id: "studentId", label: "Student ID", category: "STUDENT", exportable: true },
  { id: "rollNumber", label: "Roll Number", category: "STUDENT", exportable: true },
  { id: "gender", label: "Gender", category: "STUDENT", exportable: true },
  { id: "dateOfBirth", label: "Date of Birth", category: "STUDENT", exportable: true },
  { id: "admissionDate", label: "Admission Date", category: "STUDENT", exportable: true },
  { id: "status", label: "Status", category: "STUDENT", exportable: true },

  { id: "academicYear", label: "Academic Year", category: "ACADEMIC", exportable: false },
  { id: "class", label: "Class", category: "ACADEMIC", exportable: true },
  { id: "section", label: "Section", category: "ACADEMIC", exportable: true },
  { id: "attendanceToday", label: "Attendance Today", category: "ACADEMIC", exportable: true },

  { id: "feeStatus", label: "Fee Status", category: "FINANCE", exportable: true },
  { id: "totalFees", label: "Total Fees", category: "FINANCE", exportable: true },
  { id: "amountPaid", label: "Amount Paid", category: "FINANCE", exportable: true },
  { id: "amountDue", label: "Amount Due", category: "FINANCE", exportable: true },
  { id: "lastPayment", label: "Last Payment", category: "FINANCE", exportable: true },

  { id: "parentName", label: "Parent Name", category: "PARENT", exportable: true },
  { id: "relationship", label: "Relationship", category: "PARENT", exportable: true },
  { id: "parentContact", label: "Parent Contact", category: "PARENT", exportable: true },
  { id: "parentEmail", label: "Parent Email", category: "PARENT", exportable: true },
  { id: "parentAddress", label: "Parent Address", category: "PARENT", exportable: true },
  { id: "parentProfile", label: "Parent Profile", category: "PARENT", exportable: false },
];

export const DEFAULT_VISIBLE_COLUMNS = [
  "photo",
  "name",
  "studentId",
  "rollNumber",
  "class",
  "section",
  "attendanceToday",
  "feeStatus",
  "parentName",
  "parentContact",
];

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
    const filtered = parsed.filter((id): id is string => typeof id === "string" && validIds.has(id));
    return filtered.length > 0 ? filtered : DEFAULT_VISIBLE_COLUMNS;
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
