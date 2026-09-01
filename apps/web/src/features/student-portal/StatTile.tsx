import type { LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/Card";

// Honest, fixed thresholds applied to an already-real percentage — never a
// fabricated rating, just a label for a number computed from real records.
export function rateLabel(percentage: number): { text: string; tone: "success" | "warning" | "danger" } {
  if (percentage >= 90) return { text: "Excellent", tone: "success" };
  if (percentage >= 75) return { text: "Good", tone: "warning" };
  return { text: "Needs improvement", tone: "danger" };
}

export function StatTile({
  icon: Icon,
  label,
  value,
  unit,
  tone,
  badge,
}: {
  icon: LucideIcon;
  label: string;
  value: React.ReactNode;
  unit?: string;
  tone: "success" | "danger" | "warning" | "accent";
  badge?: React.ReactNode;
}) {
  const toneClasses: Record<string, string> = {
    success: "bg-success-soft text-success",
    danger: "bg-danger-soft text-danger",
    warning: "bg-warning-soft text-warning",
    accent: "bg-accent-soft text-accent",
  };
  return (
    <Card>
      <div className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${toneClasses[tone]}`}>
        <Icon className="size-5" />
      </div>
      <p className="mt-3 text-xs font-medium uppercase tracking-wide text-foreground-muted">{label}</p>
      <p className="mt-1 flex items-baseline gap-1.5">
        <span className="text-2xl font-semibold tabular-nums text-foreground">{value}</span>
        {unit && <span className="text-xs text-foreground-muted">{unit}</span>}
      </p>
      {badge && <div className="mt-2">{badge}</div>}
    </Card>
  );
}
