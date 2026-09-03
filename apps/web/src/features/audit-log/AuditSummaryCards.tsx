import { Activity, CheckCircle2, ShieldAlert, XCircle } from "lucide-react";
import { StatCard } from "@/components/ui/StatCard";

// Reflects the currently applied filters (the backend computes these over
// the same `where` clause as the table, not the whole table) — never a
// separate, unfiltered "total in the system" number that would silently
// disagree with what's actually shown below it.
export function AuditSummaryCards({
  summary,
}: {
  summary: { total: number; successful: number; failed: number; critical: number } | null;
}) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <StatCard icon={Activity} label="Total Events" value={summary ? summary.total.toLocaleString() : "—"} />
      <StatCard
        icon={CheckCircle2}
        label="Successful"
        value={summary ? summary.successful.toLocaleString() : "—"}
        tone="success"
      />
      <StatCard icon={XCircle} label="Failed" value={summary ? summary.failed.toLocaleString() : "—"} tone="danger" />
      <StatCard
        icon={ShieldAlert}
        label="Critical"
        value={summary ? summary.critical.toLocaleString() : "—"}
        tone="warning"
      />
    </div>
  );
}
