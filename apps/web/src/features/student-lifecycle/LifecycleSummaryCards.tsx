import { CheckCircle2, Clock, GraduationCap, LogIn, ArrowRightLeft, UserX, Hourglass, Award, Users } from "lucide-react";
import { StatCard } from "@/components/ui/StatCard";
import type { LifecyclePrimarySummary, LifecycleSecondarySummary } from "@/lib/api";

// Two clearly separated cards, matching the approved architecture — Primary
// and Secondary are never merged into one undifferentiated grid, since a
// school can hold both divisions and the two lifecycles mean different
// things (completing Primary is not the same event as graduating Secondary).
export function PrimarySummaryCard({ summary, loading }: { summary: LifecyclePrimarySummary | null; loading: boolean }) {
  const v = (n: number | undefined) => (loading || n === undefined ? "—" : n.toLocaleString());
  return (
    <div>
      <h3 className="mb-3 text-sm font-semibold text-foreground">Primary</h3>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <StatCard icon={CheckCircle2} label="Total Completed" value={v(summary?.totalCompleted)} tone="teal" />
        <StatCard icon={Hourglass} label="Awaiting Form 1" value={v(summary?.awaitingForm1)} tone="warning" />
        <StatCard icon={Clock} label="Ready for Form 1" value={v(summary?.readyForForm1)} tone="warning" />
        <StatCard icon={LogIn} label="Enrolled in Form 1" value={v(summary?.enrolledInForm1)} tone="success" />
        <StatCard icon={ArrowRightLeft} label="Transferred Out" value={v(summary?.transferredOut)} tone="neutral" />
        <StatCard icon={UserX} label="Withdrawn" value={v(summary?.withdrawn)} tone="danger" />
      </div>
    </div>
  );
}

export function SecondarySummaryCard({ summary, loading }: { summary: LifecycleSecondarySummary | null; loading: boolean }) {
  const v = (n: number | undefined) => (loading || n === undefined ? "—" : n.toLocaleString());
  return (
    <div>
      <h3 className="mb-3 text-sm font-semibold text-foreground">Secondary</h3>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <StatCard icon={GraduationCap} label="Total Graduated" value={v(summary?.totalGraduated)} tone="teal" />
        <StatCard icon={Hourglass} label="Graduation Pending" value={v(summary?.graduationPending)} tone="warning" />
        <StatCard icon={Award} label="Graduated" value={v(summary?.graduated)} tone="success" />
        <StatCard icon={Users} label="Alumni" value={v(summary?.alumni)} tone="violet" />
        <StatCard icon={ArrowRightLeft} label="Transferred Out" value={v(summary?.transferredOut)} tone="neutral" />
      </div>
    </div>
  );
}
