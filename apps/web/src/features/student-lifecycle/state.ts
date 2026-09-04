import type { LifecycleEnrollmentRow } from "@/lib/api";

// Single source of truth for turning a raw enrollment row into what a human
// sees — every branch here mirrors a bucket StudentLifecycleService derives
// server-side (see its primaryStatusWhere/secondaryStatusWhere); nothing here
// invents a new status, it just labels the same fields the backend returns.
export interface LifecycleRowState {
  statusLabel: string;
  statusTone: "neutral" | "accent" | "success" | "warning" | "danger";
  nextStep: string;
  // Present only when there's a real, available action for this row (e.g.
  // "Start Form 1 Transition") — its absence means the row is a closed
  // historical fact (graduated, transferred, withdrawn) with nothing to do.
  actionable: boolean;
}

export function resolvePrimaryRowState(row: LifecycleEnrollmentRow): LifecycleRowState {
  if (row.enrollmentStatus === "TRANSFERRED_OUT") {
    return { statusLabel: "Transferred Out", statusTone: "neutral", nextStep: "Transferred to another school", actionable: false };
  }
  if (row.lifecycleStatus === "ARCHIVED") {
    return { statusLabel: "Withdrawn", statusTone: "danger", nextStep: "No further action", actionable: false };
  }
  if (row.enrolledInForm1) {
    return { statusLabel: "Enrolled in Form 1", statusTone: "success", nextStep: "Active in Form 1", actionable: false };
  }
  return { statusLabel: "Awaiting Form 1", statusTone: "warning", nextStep: "Start Form 1 Transition", actionable: true };
}

export function resolveSecondaryRowState(row: LifecycleEnrollmentRow): LifecycleRowState {
  if (row.enrollmentStatus === "TRANSFERRED_OUT") {
    return { statusLabel: "Transferred Out", statusTone: "neutral", nextStep: "Transferred to another school", actionable: false };
  }
  if (row.enrollmentStatus === "ACTIVE") {
    return { statusLabel: "Graduation Pending", statusTone: "warning", nextStep: "Process graduation via Promotions", actionable: true };
  }
  if (row.lifecycleStatus === "ARCHIVED") {
    return { statusLabel: "Withdrawn", statusTone: "danger", nextStep: "No further action", actionable: false };
  }
  return { statusLabel: "Graduated", statusTone: "success", nextStep: "Alumni", actionable: false };
}

export function formatLifecycleDate(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}
