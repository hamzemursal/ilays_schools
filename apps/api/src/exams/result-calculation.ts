// The one place the "what counts as a result, and how do Term 1 + Term 2
// combine" rules live. ExamsService (promotion eligibility) and the
// Student/Parent Portal results report both use these, so a portal can never
// show a different percentage or a different eligibility verdict than the
// one promotion is decided on.

// A Term 2 average of 50.00 is eligible; anything below is not.
export const ELIGIBILITY_THRESHOLD = 50;

// A result only "counts" once an Admin has PUBLISHED its submission (Draft,
// Submitted, Needs Correction and Approved are all internal states), and an
// absent student has no mark — an absent row is never a 0.
export function publishedMarkedResultWhere() {
  return { resultSubmission: { status: "PUBLISHED" as const }, isAbsent: false };
}

// SUM(marks)/SUM(max) to two decimals — never an average of per-subject
// percentages. No rows (or a zero max) is "Incomplete" (null), never 0.
export function percentageFromMarks(rows: { marksObtained: number; maxMarks: number }[]): number | null {
  if (rows.length === 0) return null;
  const totalMarks = rows.reduce((sum, r) => sum + r.marksObtained, 0);
  const totalMax = rows.reduce((sum, r) => sum + r.maxMarks, 0);
  if (totalMax === 0) return null;
  return Math.round((totalMarks / totalMax) * 10000) / 100;
}

// Combines the two term percentages with the year's own configured weights
// (Term.weight). Either term missing leaves the annual result undetermined —
// never computed from the one term that exists, never defaulted to 0.
export function combineTermPercentages(
  term1Percentage: number | null,
  term2Percentage: number | null,
  term1Weight: number,
  term2Weight: number,
): { annualPercentage: number | null; eligible: boolean | null } {
  if (term1Percentage === null || term2Percentage === null) {
    return { annualPercentage: null, eligible: null };
  }
  const annualPercentage =
    Math.round((term1Percentage * (term1Weight / 100) + term2Percentage * (term2Weight / 100)) * 100) / 100;
  return { annualPercentage, eligible: annualPercentage >= ELIGIBILITY_THRESHOLD };
}
