"use client";

import { CalendarCheck, DollarSign, UserCheck, Users } from "lucide-react";
import type { StudentDirectorySummary } from "@/lib/api";
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
    <div className="flex items-center gap-4 rounded-2xl border border-border bg-background p-5 shadow-sm transition-shadow hover:shadow-md">
      <div className={`flex size-12 shrink-0 items-center justify-center rounded-2xl ${TONE_CLASSES[tone]}`}>
        <Icon className="size-6" />
      </div>
      <div className="min-w-0">
        <p className="text-3xl font-bold leading-none tabular-nums text-foreground">{value}</p>
        <p className="mt-1.5 truncate text-sm font-medium text-foreground-soft">{label}</p>
      </div>
    </div>
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
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex items-center gap-4 rounded-2xl border border-border bg-background p-5 shadow-sm">
            <div className="size-12 animate-pulse rounded-2xl bg-surface-soft" />
            <div>
              <div className="h-7 w-12 animate-pulse rounded bg-surface-soft" />
              <div className="mt-1.5 h-3 w-20 animate-pulse rounded bg-surface-soft" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
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
