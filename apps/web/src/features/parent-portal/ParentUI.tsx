"use client";

import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { CalendarCheck, GraduationCap, School as SchoolIcon, Star, Wallet } from "lucide-react";
import type { MyChild } from "@/lib/api";
import { Badge } from "@/components/ui/Badge";
import { SO_RELATIONSHIP, SO_STATUS, soStatus } from "./so";

// Shared, Somali-language building blocks for the Parent Portal pages.

// One color per child (category only — never a status), stable by position.
export const CHILD_TONES = [
  { bar: "bg-accent", soft: "bg-accent-soft", text: "text-accent" },
  { bar: "bg-violet-500", soft: "bg-violet-50", text: "text-violet-700" },
  { bar: "bg-teal-500", soft: "bg-teal-50", text: "text-teal-700" },
  { bar: "bg-amber-500", soft: "bg-amber-50", text: "text-amber-700" },
  { bar: "bg-rose-500", soft: "bg-rose-50", text: "text-rose-700" },
] as const;

export function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

// A child as a clear card: who, which school/class/year, their Student ID,
// how this parent is related, and (optionally) quick links to their pages.
export function ChildCard({
  child,
  index,
  selected,
  onSelect,
  quickLinks,
}: {
  child: MyChild;
  index: number;
  selected?: boolean;
  onSelect?: () => void;
  quickLinks?: boolean;
}) {
  const tone = CHILD_TONES[index % CHILD_TONES.length];
  const name = `${child.firstName} ${child.lastName}`;
  const e = child.enrollment;
  return (
    <div
      className={`relative flex flex-col overflow-hidden rounded-2xl border bg-background p-5 pl-6 shadow-sm transition-shadow hover:shadow-md ${
        selected ? "border-accent ring-1 ring-accent/30" : "border-border"
      }`}
    >
      <span className={`absolute inset-y-0 left-0 w-1.5 ${tone.bar}`} aria-hidden />
      <div className="flex items-start gap-3">
        <span className={`flex size-12 shrink-0 items-center justify-center rounded-2xl text-base font-bold ${tone.soft} ${tone.text}`} aria-hidden>
          {initials(name)}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-base font-semibold text-foreground">{name}</p>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <Badge tone={child.currentStatus === "ACTIVE" ? "success" : "neutral"}>{soStatus(SO_STATUS, child.currentStatus)}</Badge>
            <Badge tone="neutral">{soStatus(SO_RELATIONSHIP, child.relationship)}</Badge>
            {child.isPrimaryContact && (
              <Badge tone="accent">
                <Star className="size-3" /> Xiriirka koowaad
              </Badge>
            )}
          </div>
        </div>
      </div>

      {e ? (
        <dl className="mt-4 grid grid-cols-2 gap-2 text-sm">
          <Fact icon={SchoolIcon} label="Dugsiga" value={e.schoolName} />
          <Fact icon={GraduationCap} label="Fasalka" value={`${e.className} · ${e.sectionName}`} />
          <Fact label="Sannad-dugsiyeedka" value={e.academicYearName} />
          <Fact label="Aqoonsiga ardayga" value={e.studentNumber} mono />
        </dl>
      ) : (
        <p className="mt-4 rounded-xl bg-surface-soft p-3 text-sm text-foreground-muted">Hadda kuma diiwaangashana dugsi.</p>
      )}

      {quickLinks && (
        <div className="mt-4 grid grid-cols-3 gap-2 border-t border-border pt-4">
          <QuickLink href="/parent/academics" icon={GraduationCap} label="Natiijooyin" onClick={onSelect} />
          <QuickLink href="/parent/attendance" icon={CalendarCheck} label="Xaadiris" onClick={onSelect} />
          <QuickLink href="/parent/fees" icon={Wallet} label="Lacago" onClick={onSelect} />
        </div>
      )}
      {!quickLinks && onSelect && (
        <button
          type="button"
          onClick={onSelect}
          className={`mt-4 rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${
            selected ? "bg-accent text-white" : "bg-accent-soft/70 text-accent hover:bg-accent hover:text-white"
          }`}
        >
          {selected ? "Waa la doortay" : "Eeg xogta ilmaha"}
        </button>
      )}
    </div>
  );
}

function Fact({ icon: Icon, label, value, mono }: { icon?: LucideIcon; label: string; value: string; mono?: boolean }) {
  return (
    <div className="min-w-0 rounded-xl bg-surface-soft px-3 py-2">
      <dt className="flex items-center gap-1 text-[11px] font-medium uppercase tracking-wide text-foreground-muted">
        {Icon && <Icon className="size-3" />}
        {label}
      </dt>
      <dd className={`mt-0.5 truncate font-medium text-foreground ${mono ? "font-mono text-xs" : ""}`}>{value}</dd>
    </div>
  );
}

function QuickLink({ href, icon: Icon, label, onClick }: { href: string; icon: LucideIcon; label: string; onClick?: () => void }) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className="flex flex-col items-center gap-1 rounded-xl border border-border px-2 py-2.5 text-xs font-medium text-foreground-soft transition-colors hover:border-accent/40 hover:bg-accent-soft/40 hover:text-accent"
    >
      <Icon className="size-4" />
      {label}
    </Link>
  );
}

// Section tabs, restyled as pills.
export function PillTabs<T extends string>({ tabs, active, onChange }: { tabs: readonly T[]; active: T; onChange: (t: T) => void }) {
  return (
    <div className="flex gap-1 overflow-x-auto rounded-2xl border border-border bg-background p-1 shadow-sm" role="tablist">
      {tabs.map((t) => (
        <button
          key={t}
          type="button"
          role="tab"
          aria-selected={active === t}
          onClick={() => onChange(t)}
          className={`shrink-0 rounded-xl px-4 py-2 text-sm font-medium transition-colors ${
            active === t ? "bg-accent text-white shadow-sm" : "text-foreground-soft hover:bg-surface-soft hover:text-foreground"
          }`}
        >
          {t}
        </button>
      ))}
    </div>
  );
}

// A number tile with a colored icon.
export function StatTile({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: LucideIcon;
  label: string;
  value: React.ReactNode;
  tone: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-border bg-background p-4 shadow-sm">
      <span className={`flex size-11 shrink-0 items-center justify-center rounded-xl ${tone}`}>
        <Icon className="size-5" />
      </span>
      <div className="min-w-0">
        <p className="text-2xl font-bold leading-none tabular-nums text-foreground">{value}</p>
        <p className="mt-1 truncate text-xs font-medium text-foreground-soft">{label}</p>
      </div>
    </div>
  );
}
