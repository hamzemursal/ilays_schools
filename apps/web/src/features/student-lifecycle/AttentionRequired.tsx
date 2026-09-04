import Link from "next/link";
import { ArrowRight, Hourglass, GraduationCap, ArrowLeftRight, CheckCircle2 } from "lucide-react";

export interface AttentionItem {
  icon: typeof Hourglass;
  label: string;
  count: number;
  href: string;
}

// Every item here is a live count already fetched for the summary cards (or,
// for pending transfers, a real per-school query) — never a fabricated or
// static alert. An item disappears once its count is 0 rather than showing
// "0 pending" as if there were something to look at.
export function AttentionRequired({ items }: { items: AttentionItem[] }) {
  const visible = items.filter((i) => i.count > 0);

  if (visible.length === 0) {
    return (
      <div className="flex items-center gap-2.5 rounded-xl border border-border bg-background p-4 text-sm text-foreground-soft">
        <CheckCircle2 className="size-4.5 shrink-0 text-success" />
        Nothing needs attention right now.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
      {visible.map((item) => (
        <Link
          key={item.label}
          href={item.href}
          className="flex items-center gap-3 rounded-xl border border-warning/30 bg-warning-soft p-4 transition-colors hover:border-warning/50"
        >
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-background text-warning">
            <item.icon className="size-4.5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-lg font-semibold tabular-nums text-foreground">{item.count.toLocaleString()}</p>
            <p className="truncate text-sm text-foreground-soft">{item.label}</p>
          </div>
          <ArrowRight className="size-4 shrink-0 text-foreground-muted" />
        </Link>
      ))}
    </div>
  );
}

export const ATTENTION_ICONS = { Hourglass, GraduationCap, ArrowLeftRight };
