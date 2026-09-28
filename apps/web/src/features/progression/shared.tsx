"use client";

import type { LucideIcon } from "lucide-react";
import { ArrowRight, Check } from "lucide-react";
import type { PromotionSectionOption } from "@/lib/api";

// Shared presentation pieces for the Year-End Progression screens (Class 8
// Year-End Progression, Form 4 Graduation). Pure UI — every outcome, rule and
// write still comes from the existing Promotions / Form 1 Transition APIs.

export function formatPercent(value: number | null): string {
  return value === null ? "—" : `${value.toFixed(1)}%`;
}

export function EligibilityPill({ eligible }: { eligible: boolean | null }) {
  if (eligible === null) {
    return <span className="inline-flex items-center whitespace-nowrap rounded-full bg-warning-soft px-2.5 py-0.5 text-xs font-medium text-warning">Incomplete</span>;
  }
  return eligible ? (
    <span className="inline-flex items-center whitespace-nowrap rounded-full bg-success-soft px-2.5 py-0.5 text-xs font-medium text-success">Eligible</span>
  ) : (
    <span className="inline-flex items-center whitespace-nowrap rounded-full bg-danger-soft px-2.5 py-0.5 text-xs font-medium text-danger">Below 50%</span>
  );
}

export type OutcomeTone = "accent" | "warning" | "neutral" | "success";

const TONE_ACTIVE: Record<OutcomeTone, string> = {
  accent: "bg-accent text-white shadow-sm",
  success: "bg-success text-white shadow-sm",
  warning: "bg-warning text-white shadow-sm",
  neutral: "bg-foreground-soft text-white shadow-sm",
};

export interface OutcomeOption<T extends string> {
  value: T;
  label: string;
  tone: OutcomeTone;
  disabled?: boolean;
  disabledReason?: string;
}

// ONE outcome control per student: a compact segmented control. An empty
// value (Incomplete results) renders with no segment selected so the admin
// must decide explicitly.
export function OutcomeSegmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T | "";
  options: OutcomeOption<T>[];
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-lg border border-border bg-surface-soft p-0.5">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={o.disabled}
            title={o.disabled ? o.disabledReason : undefined}
            onClick={() => onChange(o.value)}
            className={`whitespace-nowrap rounded-md px-2.5 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 disabled:cursor-not-allowed disabled:opacity-40 ${
              active ? TONE_ACTIVE[o.tone] : "text-foreground-soft hover:bg-background hover:text-foreground"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

// A destination shown as a chip rather than a form field. When `sections` is
// given, the section part is itself a small select so the admin can adjust
// just that one exception in place.
export function DestinationChip({
  parts,
  sectionId,
  sections,
  onSectionChange,
  ariaLabel,
  tone = "accent",
}: {
  parts: string[];
  sectionId?: string;
  sections?: PromotionSectionOption[];
  onSectionChange?: (sectionId: string) => void;
  ariaLabel?: string;
  tone?: "accent" | "warning";
}) {
  const toneClass = tone === "accent" ? "border-accent/25 bg-accent-soft/40 text-accent" : "border-warning/30 bg-warning-soft/60 text-warning";
  return (
    <span className={`inline-flex max-w-full items-center gap-1 rounded-lg border px-2 py-1 text-xs font-medium ${toneClass}`}>
      <span className="truncate">{parts.join(" · ")}</span>
      {sections && onSectionChange && (
        <>
          <span aria-hidden>·</span>
          <select
            aria-label={ariaLabel}
            value={sectionId ?? ""}
            onChange={(e) => onSectionChange(e.target.value)}
            className="cursor-pointer rounded bg-transparent font-semibold underline decoration-dotted underline-offset-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
          >
            <option value="">Section…</option>
            {sections.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </>
      )}
    </span>
  );
}

export function NoEnrollmentChip({ label = "No new enrollment" }: { label?: string }) {
  return (
    <span className="inline-flex items-center rounded-lg border border-dashed border-border px-2 py-1 text-xs font-medium text-foreground-muted">
      {label}
    </span>
  );
}

// Summary tile doubling as a filter: clicking it filters the table to that
// outcome. `active` outlines the tile currently used as the filter.
export function SummaryTile({
  icon: Icon,
  label,
  value,
  tone,
  active,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  value: number;
  tone: "accent" | "success" | "warning" | "neutral" | "danger";
  active?: boolean;
  onClick?: () => void;
}) {
  const iconTone = {
    accent: "bg-accent-soft text-accent",
    success: "bg-success-soft text-success",
    warning: "bg-warning-soft text-warning",
    neutral: "bg-surface-soft text-foreground-soft",
    danger: "bg-danger-soft text-danger",
  }[tone];
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex w-full items-center gap-3 rounded-xl border bg-background p-4 text-left shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 ${
        active ? "border-accent ring-1 ring-accent/30" : "border-border hover:border-accent/40"
      }`}
    >
      <span className={`flex size-10 shrink-0 items-center justify-center rounded-lg ${iconTone}`}>
        <Icon className="size-5" />
      </span>
      <span className="min-w-0">
        <span className="block text-2xl font-semibold leading-tight tabular-nums text-foreground">{value}</span>
        <span className="block truncate text-xs font-medium text-foreground-soft">{label}</span>
      </span>
    </button>
  );
}

// One outcome group on the Review & Confirm step: how many students, and the
// exact record changes that will happen to them.
export function ReviewGroup({
  icon: Icon,
  title,
  count,
  tone,
  flow,
  children,
}: {
  icon: LucideIcon;
  title: string;
  count: number;
  tone: "accent" | "warning" | "neutral" | "success";
  flow: string[][];
  children?: React.ReactNode;
}) {
  const bar = { accent: "bg-accent", warning: "bg-warning", neutral: "bg-foreground-muted", success: "bg-success" }[tone];
  const iconTone = {
    accent: "bg-accent-soft text-accent",
    warning: "bg-warning-soft text-warning",
    neutral: "bg-surface-soft text-foreground-soft",
    success: "bg-success-soft text-success",
  }[tone];
  return (
    <section className="overflow-hidden rounded-xl border border-border bg-background shadow-sm" aria-label={title}>
      <div className={`h-1 ${bar}`} />
      <div className="p-5">
        <div className="flex items-center gap-3">
          <span className={`flex size-9 shrink-0 items-center justify-center rounded-lg ${iconTone}`}>
            <Icon className="size-4.5" />
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-foreground-soft">{title}</h3>
            <p className="text-xl font-semibold tabular-nums text-foreground">
              {count} student{count === 1 ? "" : "s"}
            </p>
          </div>
        </div>
        <ul className="mt-4 space-y-2">
          {flow.map((steps, i) => (
            <li key={i} className="flex flex-wrap items-center gap-1.5 text-sm">
              {steps.map((step, j) => (
                <span key={j} className="flex items-center gap-1.5">
                  {j > 0 && <ArrowRight className="size-3.5 text-foreground-muted" aria-hidden />}
                  <span className={j === steps.length - 1 ? "font-medium text-foreground" : "text-foreground-soft"}>{step}</span>
                </span>
              ))}
            </li>
          ))}
        </ul>
        {children}
      </div>
    </section>
  );
}

// Section picker for a workflow's source sections: all ticked by default.
export function SectionPicker({
  sections,
  selected,
  onChange,
}: {
  sections: { id: string; name: string; activeCount?: number }[];
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label="Sections">
      {sections.map((s) => {
        const checked = selected.has(s.id);
        return (
          <label
            key={s.id}
            className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors ${
              checked ? "border-accent bg-accent-soft/40 text-foreground" : "border-border text-foreground-soft hover:border-accent/40"
            }`}
          >
            <input
              type="checkbox"
              className="sr-only"
              checked={checked}
              onChange={(e) => {
                const next = new Set(selected);
                if (e.target.checked) next.add(s.id);
                else next.delete(s.id);
                onChange(next);
              }}
            />
            <span
              aria-hidden
              className={`flex size-4 items-center justify-center rounded border ${checked ? "border-accent bg-accent text-white" : "border-border bg-background"}`}
            >
              {checked && <Check className="size-3" />}
            </span>
            <span className="font-medium">Section {s.name}</span>
            {s.activeCount !== undefined && <span className="text-xs text-foreground-muted">{s.activeCount} students</span>}
          </label>
        );
      })}
    </div>
  );
}

// Header strip for a workflow: key facts as label/value pairs.
export function WorkflowFacts({ facts }: { facts: { label: string; value: React.ReactNode }[] }) {
  return (
    <dl className="grid grid-cols-2 gap-x-6 gap-y-3 rounded-xl border border-border bg-background p-4 shadow-sm sm:grid-cols-4">
      {facts.map((f) => (
        <div key={f.label} className="min-w-0">
          <dt className="text-xs font-medium uppercase tracking-wide text-foreground-muted">{f.label}</dt>
          <dd className="mt-0.5 truncate text-sm font-semibold text-foreground">{f.value}</dd>
        </div>
      ))}
    </dl>
  );
}

// Auto-fills a destination section for every id in `ids`, in order, honouring
// real capacity (the same greedy rule the old wizard used). Explicit admin
// choices in `overrides` are kept and counted against capacity first.
export function autoAssignSections(
  ids: string[],
  pool: PromotionSectionOption[],
  overrides: Map<string, string>,
): Map<string, string> {
  const used = new Map(pool.map((s) => [s.id, s.currentActive]));
  const result = new Map<string, string>();
  for (const id of ids) {
    const o = overrides.get(id);
    if (o && pool.some((s) => s.id === o)) {
      result.set(id, o);
      used.set(o, (used.get(o) ?? 0) + 1);
    }
  }
  for (const id of ids) {
    if (result.has(id)) continue;
    const target = pool.find((s) => s.capacity === null || (used.get(s.id) ?? 0) < s.capacity);
    if (target) {
      result.set(id, target.id);
      used.set(target.id, (used.get(target.id) ?? 0) + 1);
    }
  }
  return result;
}
