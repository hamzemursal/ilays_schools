import type { LucideIcon } from "lucide-react";

// success/warning/danger stay reserved for actual status meaning (good/
// caution/bad) — never repurposed just for decoration. violet/teal/amber
// are purely categorical, for telling apart stat cards that have no real
// status to report (e.g. "Total students" vs "Total teachers" are neither
// good nor bad, just different things), so a dashboard of 8+ cards doesn't
// read as one undifferentiated wall of the same blue icon.
type Tone = "neutral" | "success" | "warning" | "danger" | "violet" | "teal" | "amber";

const toneClasses: Record<Tone, string> = {
  neutral: "bg-accent-soft text-accent",
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-danger",
  violet: "bg-violet-50 text-violet-600",
  teal: "bg-teal-50 text-teal-600",
  amber: "bg-amber-50 text-amber-600",
};

export function StatCard({
  icon: Icon,
  label,
  value,
  hint,
  tone = "neutral",
}: {
  icon: LucideIcon;
  label: string;
  value: React.ReactNode;
  hint?: string;
  tone?: Tone;
}) {
  return (
    <div className="rounded-xl border border-border bg-background p-4 shadow-sm sm:p-5">
      <div className="flex items-center gap-3">
        <div className={`flex size-9 shrink-0 items-center justify-center rounded-lg ${toneClasses[tone]}`}>
          <Icon className="size-4.5" />
        </div>
        <p className="text-xs font-medium uppercase tracking-wide text-foreground-muted">{label}</p>
      </div>
      <p className="mt-3 text-2xl font-semibold tabular-nums text-foreground">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-foreground-soft">{hint}</p>}
    </div>
  );
}
