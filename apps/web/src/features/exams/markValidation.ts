// Client-side mirror of the server's rule for one typed mark
// (ExamsService.enterMarks): 0 <= mark <= the Admin-set maximum, at most two
// decimals. Returns a message to show under the row, or null when the value
// is fine (a blank is "Missing", not an error, and Absent is a separate
// status — never a 0). The server remains the authority and re-checks every
// save; this only lets a teacher see WHICH row is wrong before sending.
export function markError(value: string, maxMarks: number): string | null {
  const v = value.trim();
  if (v === "") return null;

  const n = Number(v);
  if (!Number.isFinite(n)) return "Enter a number";
  if (n < 0) return "A mark can't be negative";
  if (n > maxMarks) return `Above the maximum of ${maxMarks}`;
  if (!/^\d+(\.\d{1,2})?$/.test(v)) return "Use at most 2 decimal places";
  return null;
}
