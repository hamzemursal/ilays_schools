// "03 Sep 2026, 03:42 PM" — the exact format the spec asked for, built from
// the browser's own Intl support rather than a date library the project
// doesn't already depend on.
export function formatAuditDateTime(iso: string): string {
  const d = new Date(iso);
  const datePart = d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  const timePart = d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true });
  return `${datePart}, ${timePart}`;
}

export function formatAuditDateTimeSeconds(iso: string): string {
  const d = new Date(iso);
  const datePart = d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  const timePart = d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true });
  return `${datePart}, ${timePart}`;
}

// "STUDENT_CREATED" -> "Student created". Legacy pre-Phase-3 rows kept their
// original "school.create"-style action strings (see AuditLog.action's
// schema comment) — those don't match the ALL_CAPS pattern, so they're left
// exactly as recorded rather than mangled into something that looks
// formatted but isn't accurate.
export function formatActionLabel(action: string): string {
  if (!/^[A-Z][A-Z0-9_]*$/.test(action)) return action;
  const words = action.toLowerCase().split("_");
  return words.map((w, i) => (i === 0 ? w.charAt(0).toUpperCase() + w.slice(1) : w)).join(" ");
}

export interface ChangeRow {
  field: string;
  before: string;
  after: string;
}

// Generic before/after diff — works for every audit row regardless of which
// of the ~30 call sites created it, since none of them need to agree on a
// structured "changes" shape ahead of time. Only keys that actually differ
// are returned; a CREATE (before=null) shows every `after` key as "— ->
// value", a DELETE (after=null) shows every `before` key as "value -> —".
export function diffChanges(before: unknown, after: unknown): ChangeRow[] {
  const b = before && typeof before === "object" ? (before as Record<string, unknown>) : {};
  const a = after && typeof after === "object" ? (after as Record<string, unknown>) : {};
  const keys = new Set([...Object.keys(b), ...Object.keys(a)]);

  const rows: ChangeRow[] = [];
  for (const key of keys) {
    const bv = b[key];
    const av = a[key];
    if (JSON.stringify(bv) === JSON.stringify(av)) continue;
    rows.push({ field: key, before: formatValue(bv), after: formatValue(av) });
  }
  return rows;
}

function formatValue(v: unknown): string {
  if (v === undefined || v === null) return "—";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}
