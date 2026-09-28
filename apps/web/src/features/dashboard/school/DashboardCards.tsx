"use client";

import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { ArrowRight, ChevronRight } from "lucide-react";

// Presentation-only building blocks for the School dashboard. Every number
// they show is passed in from the existing dashboard summary API.

export type DashboardTone = "blue" | "green" | "violet" | "amber";

const TONE: Record<DashboardTone, { soft: string; text: string; bar: string }> = {
  blue: { soft: "bg-accent-soft", text: "text-accent", bar: "bg-accent" },
  green: { soft: "bg-success-soft", text: "text-success", bar: "bg-success" },
  violet: { soft: "bg-violet-50", text: "text-violet-600", bar: "bg-violet-500" },
  amber: { soft: "bg-amber-50", text: "text-amber-600", bar: "bg-amber-500" },
};

// Four ascending bars — a quiet category mark in the card's tone. Purely
// decorative (not a chart of any data), so it is hidden from assistive tech.
function ToneBars({ tone }: { tone: DashboardTone }) {
  return (
    <span className="flex h-7 items-end gap-1" aria-hidden>
      {[35, 55, 75, 100].map((h, i) => (
        <span key={h} className={`w-1.5 rounded-sm ${TONE[tone].bar}`} style={{ height: `${h}%`, opacity: 0.25 + i * 0.2 }} />
      ))}
    </span>
  );
}

export function KpiCard({
  icon: Icon,
  label,
  value,
  caption,
  tone,
  href,
}: {
  icon: LucideIcon;
  label: string;
  value: React.ReactNode;
  caption: string;
  tone: DashboardTone;
  href?: string;
}) {
  const body = (
    <>
      <div className="flex items-start gap-4">
        <span className={`flex size-14 shrink-0 items-center justify-center rounded-2xl ${TONE[tone].soft} ${TONE[tone].text}`}>
          <Icon className="size-7" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-foreground-soft">{label}</p>
          <p className="mt-1 text-3xl font-bold leading-none tabular-nums text-foreground">{value}</p>
          <p className="mt-2 truncate text-sm text-foreground-soft">{caption}</p>
        </div>
        <ToneBars tone={tone} />
      </div>
      {href && (
        <span className="absolute bottom-4 right-4 flex size-7 items-center justify-center rounded-full bg-surface text-accent transition-colors group-hover:bg-accent group-hover:text-white">
          <ChevronRight className="size-4" />
        </span>
      )}
    </>
  );
  const base = "group relative block rounded-2xl border border-border bg-background p-5 shadow-sm transition-all";
  return href ? (
    <Link
      href={href}
      aria-label={`${label}: ${typeof value === "number" || typeof value === "string" ? value : ""} — view`}
      className={`${base} hover:-translate-y-0.5 hover:border-accent/30 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40`}
    >
      {body}
    </Link>
  ) : (
    <div className={base}>{body}</div>
  );
}

export function DashboardPanel({
  icon: Icon,
  title,
  description,
  href,
  children,
  className = "",
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  href?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section aria-label={title} className={`rounded-2xl border border-border bg-background p-5 shadow-sm ${className}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent">
            <Icon className="size-5" />
          </span>
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-foreground">{title}</h2>
            <p className="mt-0.5 text-sm text-foreground-soft">{description}</p>
          </div>
        </div>
        {href && (
          <Link
            href={href}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-accent/15 bg-accent-soft/60 px-3 py-1.5 text-xs font-semibold text-accent transition-colors hover:bg-accent hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
          >
            View Details <ArrowRight className="size-3.5" />
          </Link>
        )}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

// A row of equal metrics in a soft inset strip, separated by hairlines.
export function MetricStrip({
  items,
}: {
  items: { icon?: LucideIcon; value: React.ReactNode; label: string; valueClassName?: string; iconClassName?: string }[];
}) {
  return (
    <dl
      className="grid divide-x divide-border rounded-xl bg-surface-soft py-4"
      style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}
    >
      {items.map(({ icon: Icon, value, label, valueClassName = "text-foreground", iconClassName = "text-accent" }) => (
        <div key={label} className="min-w-0 px-2 text-center">
          <dd className={`flex items-center justify-center gap-2 text-2xl font-bold tabular-nums ${valueClassName}`}>
            {Icon && <Icon className={`size-5 shrink-0 ${iconClassName}`} />}
            {value}
          </dd>
          <dt className="mt-1 truncate text-[11px] font-semibold uppercase tracking-wide text-foreground-muted">{label}</dt>
        </div>
      ))}
    </dl>
  );
}

// Circular "share marked present" gauge; null = nothing marked yet.
export function AttendanceRing({ percent }: { percent: number | null }) {
  const r = 34;
  const c = 2 * Math.PI * r;
  const value = percent ?? 0;
  return (
    <div className="relative size-24 shrink-0" role="img" aria-label={percent === null ? "Not marked yet" : `${percent}% present`}>
      <svg viewBox="0 0 80 80" className="size-24 -rotate-90">
        <circle cx="40" cy="40" r={r} fill="none" stroke="var(--surface-hover)" strokeWidth="8" />
        <circle
          cx="40"
          cy="40"
          r={r}
          fill="none"
          stroke="var(--accent)"
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c - (c * value) / 100}
        />
      </svg>
      <span className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-lg font-bold tabular-nums text-foreground">{percent === null ? "0%" : `${percent}%`}</span>
        <span className="text-[10px] text-foreground-muted">{percent === null ? "Not marked" : "Present"}</span>
      </span>
    </div>
  );
}
