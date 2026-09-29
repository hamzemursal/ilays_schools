"use client";

import { useState } from "react";
import type { LucideIcon } from "lucide-react";
import { CheckCircle2, ChevronLeft, ChevronRight, Circle, Clock, ShieldCheck, XCircle } from "lucide-react";
import type { AttendanceSession, AttendanceStatus } from "@/lib/api";
import type { DayAttendance } from "@/lib/attendance";
import { usePortalLocale } from "@/lib/portal-locale";

// Shared building blocks for every Attendance screen (admin overview, the
// section marking page, a student's history, and the read-only Parent /
// Student portals). Presentation only — every number shown is computed by
// the caller from real API data; nothing here fetches or decides a rule.

// ─── Dates ───────────────────────────────────────────────────────────────

// Same key rule as groupAttendanceByDate: the record's own UTC calendar day.
export function dayKey(date: string | Date): string {
  return new Date(date).toISOString().slice(0, 10);
}

export function monthStart(date: string | Date): Date {
  const d = new Date(date);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

export function addMonths(month: Date, delta: number): Date {
  return new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + delta, 1));
}

export function monthRange(month: Date): { from: string; to: string } {
  const last = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 0));
  return { from: dayKey(month), to: dayKey(last) };
}

export function monthKey(month: Date): string {
  return dayKey(month).slice(0, 7);
}

function localeTag(locale: string) {
  return locale === "so" ? "so-SO" : undefined;
}

export function formatMonth(month: Date, locale = "en"): string {
  return month.toLocaleDateString(localeTag(locale), {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function formatDay(
  key: string,
  locale = "en",
  options: Intl.DateTimeFormatOptions = {
    day: "numeric",
    month: "short",
    year: "numeric",
  },
) {
  return new Date(`${key}T00:00:00Z`).toLocaleDateString(localeTag(locale), {
    ...options,
    timeZone: "UTC",
  });
}

// ─── Text ────────────────────────────────────────────────────────────────

const TEXT = {
  en: {
    weekdays: ["Sat", "Sun", "Mon", "Tue", "Wed", "Thu", "Fri"],
    both: "Morning + Afternoon",
    morning: "Morning only",
    afternoon: "Afternoon only",
    partial: "Some sections",
    missed: "Not recorded",
    none: "No attendance taken",
    prev: "Previous month",
    next: "Next month",
    morningSession: "Morning",
    afternoonSession: "Afternoon",
    notRecorded: "Not Recorded",
    date: "Date",
    status: {
      PRESENT: "Present",
      ABSENT: "Absent",
      LATE: "Late",
      EXCUSED: "Excused",
    } as Record<AttendanceStatus, string>,
  },
  so: {
    weekdays: ["Sab", "Axd", "Isn", "Tal", "Arb", "Kha", "Jim"],
    both: "Subax + Galab",
    morning: "Subax oo keliya",
    afternoon: "Galab oo keliya",
    partial: "Qaybo ka mid ah",
    missed: "Lama qorin",
    none: "Xaadiris lama qaadin",
    prev: "Bishii hore",
    next: "Bisha xigta",
    morningSession: "Subax",
    afternoonSession: "Galab",
    notRecorded: "Lama qorin",
    date: "Taariikhda",
    status: {
      PRESENT: "Joogay",
      ABSENT: "Maqnaa",
      LATE: "Daahay",
      EXCUSED: "Fasax",
    } as Record<AttendanceStatus, string>,
  },
};

export function useAttendanceText() {
  return TEXT[usePortalLocale()];
}

// ─── Status styling ──────────────────────────────────────────────────────

export const STATUS_META: Record<AttendanceStatus, { icon: LucideIcon; chip: string; solid: string; dot: string }> = {
  PRESENT: {
    icon: CheckCircle2,
    chip: "bg-success-soft text-success",
    solid: "bg-success text-white border-success",
    dot: "bg-success",
  },
  ABSENT: {
    icon: XCircle,
    chip: "bg-danger-soft text-danger",
    solid: "bg-danger text-white border-danger",
    dot: "bg-danger",
  },
  LATE: {
    icon: Clock,
    chip: "bg-warning-soft text-warning",
    solid: "bg-warning text-white border-warning",
    dot: "bg-warning",
  },
  EXCUSED: {
    icon: ShieldCheck,
    chip: "bg-violet-50 text-violet-700",
    solid: "bg-violet-600 text-white border-violet-600",
    dot: "bg-violet-600",
  },
};

export function StatusPill({ status }: { status?: AttendanceStatus | null }) {
  const t = useAttendanceText();
  if (!status) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-surface px-2.5 py-0.5 text-xs font-medium text-foreground-muted">
        <Circle className="size-3" /> {t.notRecorded}
      </span>
    );
  }
  const meta = STATUS_META[status];
  const Icon = meta.icon;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${meta.chip}`}>
      <Icon className="size-3" /> {t.status[status]}
    </span>
  );
}

// ─── Summary cards ───────────────────────────────────────────────────────

export type Tone = "accent" | "success" | "danger" | "warning" | "violet" | "neutral";

const TONE_ICON: Record<Tone, string> = {
  accent: "bg-accent-soft text-accent",
  success: "bg-success-soft text-success",
  danger: "bg-danger-soft text-danger",
  warning: "bg-warning-soft text-warning",
  violet: "bg-violet-50 text-violet-600",
  neutral: "bg-surface text-foreground-soft",
};

export function SummaryCard({
  icon: Icon,
  label,
  value,
  hint,
  tone = "accent",
}: {
  icon: LucideIcon;
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  tone?: Tone;
}) {
  return (
    <div className="flex min-w-0 items-start gap-3 rounded-2xl border border-border bg-background p-4 shadow-sm">
      <span className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${TONE_ICON[tone]}`}>
        <Icon className="size-5" />
      </span>
      <div className="min-w-0">
        <p className="text-xs font-medium text-foreground-muted">{label}</p>
        <p className="mt-0.5 text-xl font-semibold tabular-nums text-foreground">{value}</p>
        {hint && <p className="mt-0.5 text-xs text-foreground-soft">{hint}</p>}
      </div>
    </div>
  );
}

// ─── Calendar ────────────────────────────────────────────────────────────

// both / morning / afternoon: which sessions were recorded that day.
// partial: only some of the sections in scope recorded it (overview only).
// missed: the school took attendance that day, but not for this scope.
// none: no attendance anywhere that day (weekend, holiday, or just not taken).
export type CalendarState = "both" | "morning" | "afternoon" | "partial" | "missed" | "none";

const STATE_STYLE: Record<CalendarState, string> = {
  both: "bg-success-soft text-success border-success/30",
  morning: "bg-accent-soft text-accent border-accent/30",
  afternoon: "bg-violet-50 text-violet-700 border-violet-200",
  partial: "bg-warning-soft text-warning border-warning/30",
  missed: "bg-danger-soft text-danger border-danger/25",
  none: "bg-background text-foreground-soft border-border",
};

const STATE_DOT: Record<CalendarState, string> = {
  both: "bg-success",
  morning: "bg-accent",
  afternoon: "bg-violet-600",
  partial: "bg-warning",
  missed: "bg-danger",
  none: "bg-border-strong",
};

export function CalendarLegend({ states }: { states: CalendarState[] }) {
  const t = useAttendanceText();
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-foreground-soft">
      {states.map((s) => (
        <li key={s} className="inline-flex items-center gap-1.5">
          <span className={`size-2.5 rounded-full ${STATE_DOT[s]}`} aria-hidden />
          {t[s]}
        </li>
      ))}
    </ul>
  );
}

export function MonthNav({
  month,
  onChange,
  min,
  max,
}: {
  month: Date;
  onChange: (month: Date) => void;
  min?: Date;
  max?: Date;
}) {
  const locale = usePortalLocale();
  const t = TEXT[locale];
  const canPrev = !min || addMonths(month, -1) >= monthStart(min);
  const canNext = !max || addMonths(month, 1) <= monthStart(max);
  const btn =
    "flex size-10 items-center justify-center rounded-xl border border-border bg-background text-foreground-soft transition-colors hover:border-accent hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:pointer-events-none disabled:opacity-40";
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        className={btn}
        onClick={() => onChange(addMonths(month, -1))}
        disabled={!canPrev}
        aria-label={t.prev}
      >
        <ChevronLeft className="size-4" />
      </button>
      <p className="min-w-[9.5rem] text-center text-sm font-semibold text-foreground" aria-live="polite">
        {formatMonth(month, locale)}
      </p>
      <button
        type="button"
        className={btn}
        onClick={() => onChange(addMonths(month, 1))}
        disabled={!canNext}
        aria-label={t.next}
      >
        <ChevronRight className="size-4" />
      </button>
    </div>
  );
}

export function AttendanceCalendar({
  month,
  stateFor,
  selectedKey,
  onSelect,
}: {
  month: Date;
  stateFor: (key: string) => CalendarState;
  selectedKey?: string | null;
  onSelect?: (key: string) => void;
}) {
  const locale = usePortalLocale();
  const t = TEXT[locale];
  const today = dayKey(new Date());
  const daysInMonth = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 0)).getUTCDate();
  // Weeks start on Saturday (index 0), matching the school week.
  const lead = (month.getUTCDay() + 1) % 7;
  const cells: (string | null)[] = [
    ...Array.from({ length: lead }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) =>
      dayKey(new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth(), i + 1))),
    ),
  ];

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[19rem]">
        <div className="grid grid-cols-7 gap-1.5 pb-1.5 text-center text-[11px] font-semibold uppercase tracking-wide text-foreground-muted">
          {t.weekdays.map((d) => (
            <span key={d}>{d}</span>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1.5">
          {cells.map((key, i) => {
            if (!key) return <span key={`blank-${i}`} aria-hidden />;
            const future = key > today;
            const state = future ? "none" : stateFor(key);
            const selected = key === selectedKey;
            const label = `${formatDay(key, locale, { weekday: "long", day: "numeric", month: "long" })}: ${future ? "—" : t[state]}`;
            return (
              <button
                key={key}
                type="button"
                disabled={future || !onSelect}
                onClick={() => onSelect?.(key)}
                aria-label={label}
                aria-pressed={selected}
                title={label}
                className={`flex h-11 flex-col items-center justify-center rounded-xl border text-sm font-semibold tabular-nums transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent sm:h-14 ${
                  future ? "border-transparent text-foreground-muted/50" : STATE_STYLE[state]
                } ${selected ? "ring-2 ring-accent ring-offset-1" : ""} ${!future && onSelect ? "cursor-pointer hover:brightness-95" : ""} ${
                  key === today ? "underline decoration-2 underline-offset-4" : ""
                }`}
              >
                {Number(key.slice(8))}
                {!future && state !== "none" && (
                  <span className={`mt-1 hidden size-1.5 rounded-full sm:block ${STATE_DOT[state]}`} aria-hidden />
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Session history (Morning / Afternoon side by side) ──────────────────

export function sessionState(day: Pick<DayAttendance, "sessions"> | undefined): CalendarState {
  if (!day) return "none";
  const m = !!day.sessions.MORNING;
  const a = !!day.sessions.AFTERNOON;
  return m && a ? "both" : m ? "morning" : a ? "afternoon" : "none";
}

// One row per day on wide screens; each row turns into a compact card on a
// phone (same DOM, CSS only — no second copy of the data).
export function MonthlyAttendanceHistory({ days, showClass = false }: { days: DayAttendance[]; showClass?: boolean }) {
  const locale = usePortalLocale();
  const t = TEXT[locale];
  const sessions: { key: AttendanceSession; label: string }[] = [
    { key: "MORNING", label: t.morningSession },
    { key: "AFTERNOON", label: t.afternoonSession },
  ];
  return (
    <table className="w-full text-left text-sm">
      <thead className="bg-surface-soft text-xs font-semibold uppercase tracking-wide text-foreground-muted max-sm:hidden">
        <tr>
          <th className="px-5 py-2.5">{t.date}</th>
          {showClass && <th className="px-5 py-2.5">Class / Section</th>}
          {sessions.map((s) => (
            <th key={s.key} className="px-5 py-2.5">
              {s.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody className="divide-y divide-border max-sm:block max-sm:divide-y-0 max-sm:space-y-2 max-sm:p-3">
        {days.map((day) => (
          <tr key={day.date} className="max-sm:block max-sm:rounded-xl max-sm:border max-sm:border-border max-sm:p-3">
            <td className="whitespace-nowrap px-5 py-3 font-medium text-foreground max-sm:block max-sm:p-0 max-sm:pb-2">
              {formatDay(dayKey(day.date), locale, {
                weekday: "short",
                day: "numeric",
                month: "short",
              })}
              {showClass && (
                <span className="ml-2 text-xs font-normal text-foreground-muted sm:hidden">
                  {day.className} · {day.sectionName}
                </span>
              )}
            </td>
            {showClass && (
              <td className="whitespace-nowrap px-5 py-3 text-foreground-soft max-sm:hidden">
                {day.className} · {day.sectionName}
              </td>
            )}
            {sessions.map((s) => (
              <td
                key={s.key}
                className="px-5 py-3 max-sm:flex max-sm:items-center max-sm:justify-between max-sm:p-0 max-sm:py-1"
              >
                <span className="text-xs text-foreground-muted sm:hidden">{s.label}</span>
                <StatusPill status={day.sessions[s.key]?.status} />
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// Detail for one calendar day in a single-student view.
export function DaySessionsDetail({ day, dateKey }: { day?: DayAttendance; dateKey: string }) {
  const locale = usePortalLocale();
  const t = TEXT[locale];
  return (
    <div className="rounded-xl border border-border bg-surface-soft p-3.5">
      <p className="text-sm font-semibold text-foreground">
        {formatDay(dateKey, locale, {
          weekday: "long",
          day: "numeric",
          month: "long",
          year: "numeric",
        })}
      </p>
      <div className="mt-2 grid grid-cols-2 gap-2">
        {(["MORNING", "AFTERNOON"] as const).map((s) => (
          <div key={s} className="rounded-lg bg-background p-2.5">
            <p className="text-xs text-foreground-muted">{s === "MORNING" ? t.morningSession : t.afternoonSession}</p>
            <div className="mt-1">
              <StatusPill status={day?.sessions[s]?.status} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── A single student's month: calendar + day detail + that month's list ──

const MONTH_TEXT = {
  en: {
    calendar: "Monthly calendar",
    history: "Monthly history",
    empty: "No attendance recorded this month.",
    tap: "Select a day to see both sessions.",
  },
  so: {
    calendar: "Jadwalka bisha",
    history: "Taariikhda bisha",
    empty: "Bishan xaadiris lama diiwaangelin.",
    tap: "Dooro maalin si aad u aragto labada xilli.",
  },
};

export function StudentMonthView({ days, showHistory = true }: { days: DayAttendance[]; showHistory?: boolean }) {
  const locale = usePortalLocale();
  const mt = MONTH_TEXT[locale];
  const byKey = new Map(days.map((d) => [dayKey(d.date), d]));
  const newest = days[0] ? monthStart(days[0].date) : monthStart(new Date());
  const oldest = days.length ? monthStart(days[days.length - 1].date) : newest;
  const [month, setMonth] = useState(newest);
  const [selected, setSelected] = useState<string | null>(null);
  const inMonth = days.filter((d) => dayKey(d.date).startsWith(monthKey(month)));

  return (
    <div className={showHistory ? "grid gap-5 xl:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]" : ""}>
      <div className="rounded-2xl border border-border bg-background p-4 shadow-sm sm:p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-foreground">{mt.calendar}</h3>
          <MonthNav
            month={month}
            min={oldest}
            max={newest}
            onChange={(m) => {
              setMonth(m);
              setSelected(null);
            }}
          />
        </div>
        <AttendanceCalendar
          month={month}
          stateFor={(k) => sessionState(byKey.get(k))}
          selectedKey={selected}
          onSelect={setSelected}
        />
        <div className="mt-4 space-y-3">
          <CalendarLegend states={["both", "morning", "afternoon", "none"]} />
          {selected ? (
            <DaySessionsDetail dateKey={selected} day={byKey.get(selected)} />
          ) : (
            <p className="text-xs text-foreground-muted">{mt.tap}</p>
          )}
        </div>
      </div>
      {showHistory && (
        <div className="overflow-hidden rounded-2xl border border-border bg-background shadow-sm">
          <div className="border-b border-border px-5 py-4">
            <h3 className="text-sm font-semibold text-foreground">{mt.history}</h3>
            <p className="mt-0.5 text-sm text-foreground-soft">{formatMonth(month, locale)}</p>
          </div>
          {inMonth.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-foreground-muted">{mt.empty}</p>
          ) : (
            <MonthlyAttendanceHistory days={inMonth} />
          )}
        </div>
      )}
    </div>
  );
}
