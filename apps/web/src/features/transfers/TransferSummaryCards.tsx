import { Clock, CheckCircle2, XCircle, Ban } from "lucide-react";
import { StatCard } from "@/components/ui/StatCard";
import type { TransferDirectionSummary } from "@/lib/api";

// Same four buckets for either direction — there's no separate "Accepted"
// count since accept-and-complete is one step (EXECUTED) in this system;
// see TransferBadges.tsx.
export function TransferSummaryCards({ summary, loading }: { summary: TransferDirectionSummary | null; loading: boolean }) {
  const v = (n: number | undefined) => (loading || n === undefined ? "—" : n.toLocaleString());
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <StatCard icon={Clock} label="Pending" value={v(summary?.pending)} tone="warning" />
      <StatCard icon={CheckCircle2} label="Completed" value={v(summary?.completed)} tone="success" />
      <StatCard icon={XCircle} label="Rejected" value={v(summary?.rejected)} tone="danger" />
      <StatCard icon={Ban} label="Cancelled" value={v(summary?.cancelled)} tone="neutral" />
    </div>
  );
}
