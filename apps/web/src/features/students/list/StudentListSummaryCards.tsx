"use client";

import { CalendarCheck, DollarSign, UserCheck, Users } from "lucide-react";
import type { StudentDirectorySummary } from "@/lib/api";
import { Card } from "@/components/ui/Card";
import { DECORATIVE_TONE_CLASSES } from "@/components/ui/decorativeTones";

const TONE_CLASSES = {
  accent: "bg-accent-soft text-accent",
  success: "bg-success-soft text-success",
  violet: DECORATIVE_TONE_CLASSES.violet,
  amber: DECORATIVE_TONE_CLASSES.amber,
} as const;

function SummaryCard({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: React.ReactNode;
  tone: keyof typeof TONE_CLASSES;
}) {
  return (
    <Card>
      <div className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${TONE_CLASSES[tone]}`}>
        <Icon className="size-5" />
      </div>
      <p className="mt-3 text-2xl font-semibold tabular-nums text-foreground">{value}</p>
      <p className="text-xs font-medium text-foreground-muted">{label}</p>
    </Card>
  );
}

// Every figure here is computed server-side over the FULL current filtered
// set (see StudentDirectoryService.summary) — never just the visible page,
// and never a client-side guess. "Present Today" and "Outstanding Payments"
// are shown only when the backend actually included them, i.e. the actor
// holds attendance.view / finance.ledger.view respectively — their absence
// here mirrors what the table itself would also be unable to show.
export function StudentListSummaryCards({ summary, loading }: { summary: StudentDirectorySummary | null; loading?: boolean }) {
  if (loading || !summary) {
    return (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Card key={i}>
            <div className="size-10 animate-pulse rounded-xl bg-surface-soft" />
            <div className="mt-3 h-7 w-12 animate-pulse rounded bg-surface-soft" />
            <div className="mt-1 h-3 w-20 animate-pulse rounded bg-surface-soft" />
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <SummaryCard icon={Users} label="Total Students" value={summary.total} tone="accent" />
      <SummaryCard icon={UserCheck} label="Active Students" value={summary.active} tone="success" />
      {summary.presentToday !== null && (
        <SummaryCard icon={CalendarCheck} label="Present Today" value={summary.presentToday} tone="violet" />
      )}
      {summary.outstandingBalances !== null && (
        <SummaryCard icon={DollarSign} label="Outstanding Payments" value={summary.outstandingBalances} tone="amber" />
      )}
    </div>
  );
}
