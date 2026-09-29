"use client";

import { use, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAuth, ApiError } from "@/lib/auth-context";
import { api, type AcademicYear, type AttendanceStatusForDate, type EnrollmentReportRow } from "@/lib/api";
import { PageHeader } from "@/components/ui/PageHeader";
import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { Select } from "@/components/ui/FormControls";
import { SkeletonCards } from "@/components/ui/Skeleton";
import {
  AttendanceCalendar,
  CalendarLegend,
  MonthNav,
  SummaryCard,
  dayKey,
  formatDay,
  monthKey,
  monthRange,
  monthStart,
  type CalendarState,
} from "@/features/attendance/AttendanceUI";
import { CalendarCheck, CalendarX, CheckCircle2, ChevronRight, Circle, ClipboardCheck, Moon, Sun, Users } from "lucide-react";

// Which sessions a section finalized on each day of the viewed month.
type SectionDays = Map<string, { MORNING: boolean; AFTERNOON: boolean }>;

interface SectionRef {
  sectionId: string;
  sectionName: string;
  className: string;
  enrolled: number;
}

// The School Admin's entry point into attendance — browses every class and
// section in the school (unlike a teacher's My Classes, which only shows
// their own assignments) and hands off to the same shared attendance page,
// so marking/reviewing logic is never duplicated. The month view is built
// only from each section's own finalized history — sections are never merged.
export default function AdminAttendancePage({ params }: { params: Promise<{ id: string }> }) {
  const { id: schoolId } = use(params);
  const { accessToken } = useAuth();

  const [years, setYears] = useState<AcademicYear[] | null>(null);
  const [academicYearId, setAcademicYearId] = useState("");
  const [rows, setRows] = useState<EnrollmentReportRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [todayStatus, setTodayStatus] = useState<AttendanceStatusForDate | null>(null);

  useEffect(() => {
    if (!accessToken) return;
    api
      .listAcademicYears(accessToken, schoolId)
      .then((list) => {
        setYears(list);
        const current = list.find((y) => y.isCurrent) ?? list[0];
        if (current) setAcademicYearId(current.id);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load academic years"));
  }, [accessToken, schoolId]);

  useEffect(() => {
    if (!accessToken || !academicYearId) return;
    api
      .getEnrollmentReport(accessToken, schoolId, academicYearId)
      .then(setRows)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load classes"));
  }, [accessToken, schoolId, academicYearId]);

  const today = new Date().toISOString().slice(0, 10);

  // Lets each section card show whether today has already been marked,
  // instead of making an admin open every section just to find out.
  useEffect(() => {
    if (!accessToken) return;
    api
      .getAttendanceStatusForDate(accessToken, schoolId, today)
      .then(setTodayStatus)
      .catch(() => setTodayStatus(null));
  }, [accessToken, schoolId, today]);

  const year = years?.find((y) => y.id === academicYearId);
  const yearName = year?.name ?? "";

  function attendanceUrl(className: string, sectionId: string, sectionName: string, date = today) {
    const query = new URLSearchParams({
      date,
      year: yearName,
      class: className,
      section: sectionName,
      backHref: `/schools/${schoolId}/attendance`,
      backLabel: "Attendance",
    });
    return `/schools/${schoolId}/sections/${sectionId}/attendance?${query.toString()}`;
  }

  return (
    <div>
      <PageHeader
        variant="plain"
        eyebrow="Attendance"
        title="Attendance"
        description="Section-based attendance — two sessions a day, Morning and Afternoon."
        breadcrumbs={[{ label: "Dashboard", href: `/schools/${schoolId}/dashboard` }, { label: "Attendance" }]}
        actions={
          years &&
          years.length > 0 && (
            <Select
              value={academicYearId}
              onChange={(e) => setAcademicYearId(e.target.value)}
              aria-label="Academic year"
              className="w-auto min-w-[170px]"
            >
              {years.map((y) => (
                <option key={y.id} value={y.id}>
                  {y.name}
                  {y.isCurrent ? " (current)" : ""}
                </option>
              ))}
            </Select>
          )
        }
      />

      <div className="space-y-5 px-3 pb-8 pt-4 sm:px-5">
        {error ? (
          <Alert tone="danger">{error}</Alert>
        ) : !years ? (
          <SkeletonCards count={3} />
        ) : years.length === 0 ? (
          <EmptyState
            icon={ClipboardCheck}
            title="No academic year yet"
            description="Create an academic year in Academic before you can take attendance."
          />
        ) : !rows || !year ? (
          <SkeletonCards count={3} />
        ) : rows.length === 0 ? (
          <EmptyState icon={ClipboardCheck} title="No classes yet" description="Set up classes and sections in Academic first." />
        ) : (
          <YearOverview
            key={year.id}
            accessToken={accessToken!}
            schoolId={schoolId}
            year={year}
            rows={rows}
            todayStatus={todayStatus}
            attendanceUrl={attendanceUrl}
          />
        )}
      </div>
    </div>
  );
}

function initialMonth(year: AcademicYear): Date {
  const now = new Date();
  if (now >= new Date(year.startDate) && now <= new Date(year.endDate)) return monthStart(now);
  return monthStart(now < new Date(year.startDate) ? year.startDate : year.endDate);
}

function YearOverview({
  accessToken,
  schoolId,
  year,
  rows,
  todayStatus,
  attendanceUrl,
}: {
  accessToken: string;
  schoolId: string;
  year: AcademicYear;
  rows: EnrollmentReportRow[];
  todayStatus: AttendanceStatusForDate | null;
  attendanceUrl: (className: string, sectionId: string, sectionName: string, date?: string) => string;
}) {
  const [month, setMonth] = useState(() => initialMonth(year));
  const [now] = useState(() => Date.now());
  const [scope, setScope] = useState<string>("all");
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [loaded, setLoaded] = useState<{ key: string; days: Map<string, SectionDays>; error: string | null } | null>(null);

  const sections: SectionRef[] = useMemo(
    () => rows.flatMap((c) => c.sections.map((s) => ({ ...s, className: c.className }))),
    [rows],
  );
  const loadKey = `${monthKey(month)}|${sections.map((s) => s.sectionId).join(",")}`;

  useEffect(() => {
    const { from, to } = monthRange(month);
    let cancelled = false;
    Promise.all(
      sections.map((s) =>
        api.getAttendanceHistory(accessToken, schoolId, s.sectionId, from, to).then((records) => {
          const days: SectionDays = new Map();
          for (const r of records) {
            const k = dayKey(r.date);
            const d = days.get(k) ?? { MORNING: false, AFTERNOON: false };
            d[r.session ?? "MORNING"] = true;
            days.set(k, d);
          }
          return [s.sectionId, days] as const;
        }),
      ),
    )
      .then((entries) => !cancelled && setLoaded({ key: loadKey, days: new Map(entries), error: null }))
      .catch((err) =>
        !cancelled &&
        setLoaded({ key: loadKey, days: new Map(), error: err instanceof ApiError ? err.message : "Failed to load attendance" }),
      );
    return () => {
      cancelled = true;
    };
  }, [accessToken, schoolId, month, sections, loadKey]);

  const data = loaded?.key === loadKey ? loaded : null;
  const sectionDays = useMemo(() => data?.days ?? new Map<string, SectionDays>(), [data]);

  // A "school day" is any day on which at least one section finalized
  // attendance — there is no timetable/holiday model to count from.
  const schoolDays = useMemo(() => {
    const set = new Set<string>();
    for (const days of sectionDays.values()) for (const k of days.keys()) set.add(k);
    return [...set].sort();
  }, [sectionDays]);

  const scopeSections = scope === "all" ? sections.filter((s) => s.enrolled > 0) : sections.filter((s) => s.sectionId === scope);

  function sessionsFor(key: string) {
    let morning = 0;
    let afternoon = 0;
    for (const s of scopeSections) {
      const d = sectionDays.get(s.sectionId)?.get(key);
      if (d?.MORNING) morning++;
      if (d?.AFTERNOON) afternoon++;
    }
    return { morning, afternoon, total: scopeSections.length };
  }

  function stateFor(key: string): CalendarState {
    const { morning, afternoon, total } = sessionsFor(key);
    if (morning === 0 && afternoon === 0) return schoolDays.includes(key) && total > 0 ? "missed" : "none";
    const allM = morning === total;
    const allA = afternoon === total;
    if (allM && allA) return "both";
    if (allM && afternoon === 0) return "morning";
    if (allA && morning === 0) return "afternoon";
    return "partial";
  }

  const recordedDays = schoolDays.filter((k) => ["both", "morning", "afternoon"].includes(stateFor(k))).length;
  const morningDays = schoolDays.filter((k) => {
    const s = sessionsFor(k);
    return s.total > 0 && s.morning === s.total;
  }).length;
  const afternoonDays = schoolDays.filter((k) => {
    const s = sessionsFor(k);
    return s.total > 0 && s.afternoon === s.total;
  }).length;
  const loading = !data;

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-background p-3 shadow-sm sm:p-4">
        <MonthNav
          month={month}
          min={new Date(year.startDate)}
          max={new Date(Math.min(now, new Date(year.endDate).getTime()))}
          onChange={(m) => {
            setMonth(m);
            setSelectedDay(null);
          }}
        />
        <Select value={scope} onChange={(e) => setScope(e.target.value)} aria-label="Show attendance for" className="w-full sm:w-auto sm:min-w-[220px]">
          <option value="all">All sections</option>
          {rows.map((c) => (
            <optgroup key={c.classId} label={c.className}>
              {c.sections.map((s) => (
                <option key={s.sectionId} value={s.sectionId}>
                  {c.className} — Section {s.sectionName}
                </option>
              ))}
            </optgroup>
          ))}
        </Select>
      </div>

      {data?.error && <Alert tone="danger">{data.error}</Alert>}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <SummaryCard
          icon={CalendarCheck}
          label="Days recorded"
          value={loading ? "—" : `${recordedDays} / ${schoolDays.length}`}
          hint="school days this month"
          tone="accent"
        />
        <SummaryCard icon={Sun} label="Morning sessions" value={loading ? "—" : morningDays} hint="recorded" tone="success" />
        <SummaryCard icon={Moon} label="Afternoon sessions" value={loading ? "—" : afternoonDays} hint="recorded" tone="violet" />
        <SummaryCard
          icon={CalendarX}
          label="Not recorded"
          value={loading ? "—" : schoolDays.length - recordedDays}
          hint="day(s) incomplete"
          tone={!loading && schoolDays.length - recordedDays > 0 ? "danger" : "neutral"}
        />
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,28rem)_minmax(0,1fr)]">
        <section className="rounded-2xl border border-border bg-background p-4 shadow-sm sm:p-5" aria-label="Monthly calendar">
          <div className="mb-4">
            <h2 className="text-sm font-semibold text-foreground">Monthly calendar</h2>
            <p className="mt-0.5 text-xs text-foreground-soft">
              {scope === "all" ? "All sections" : `${scopeSections[0]?.className} — Section ${scopeSections[0]?.sectionName}`}. Select a day to inspect it.
            </p>
          </div>
          {loading ? (
            <SkeletonCards count={1} />
          ) : (
            <AttendanceCalendar month={month} stateFor={stateFor} selectedKey={selectedDay} onSelect={setSelectedDay} />
          )}
          <div className="mt-4">
            <CalendarLegend states={scope === "all" ? ["both", "morning", "afternoon", "partial", "missed", "none"] : ["both", "morning", "afternoon", "missed", "none"]} />
          </div>
        </section>

        <section className="rounded-2xl border border-border bg-background shadow-sm" aria-label="Day detail">
          <div className="border-b border-border px-5 py-4">
            <h2 className="text-sm font-semibold text-foreground">
              {selectedDay ? formatDay(selectedDay, "en", { weekday: "long", day: "numeric", month: "long", year: "numeric" }) : "Day detail"}
            </h2>
            <p className="mt-0.5 text-xs text-foreground-soft">
              {selectedDay ? "Recording status of each section for this date." : "Pick a day on the calendar to see every section's Morning and Afternoon status."}
            </p>
          </div>
          {!selectedDay && (
            <div className="flex flex-col items-center justify-center gap-2 px-5 py-14 text-center">
              <span className="flex size-12 items-center justify-center rounded-2xl bg-accent-soft text-accent">
                <CalendarCheck className="size-6" />
              </span>
              <p className="max-w-xs text-sm text-foreground-soft">No day selected yet.</p>
            </div>
          )}
          {selectedDay && (
            <ul className="divide-y divide-border">
              {scopeSections.map((s) => {
                const d = sectionDays.get(s.sectionId)?.get(selectedDay);
                return (
                  <li key={s.sectionId} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-foreground">
                        {s.className} — Section {s.sectionName}
                      </p>
                      <p className="text-xs text-foreground-muted">{s.enrolled} student(s)</p>
                    </div>
                    <SessionFlag label="Morning" on={!!d?.MORNING} />
                    <SessionFlag label="Afternoon" on={!!d?.AFTERNOON} />
                    <Link
                      href={attendanceUrl(s.className, s.sectionId, s.sectionName, selectedDay)}
                      className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm font-medium text-accent hover:bg-accent-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                    >
                      Open <ChevronRight className="size-4" />
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>

      <div className="space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-foreground-muted">Classes &amp; sections</h2>
        {rows.map((cls) => (
          <div key={cls.classId} className="rounded-2xl border border-border bg-background shadow-sm">
            <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-3.5">
              <h3 className="font-semibold text-foreground">{cls.className}</h3>
              <span className="inline-flex items-center gap-1.5 text-sm text-foreground-soft">
                <Users className="size-4" /> {cls.totalEnrolled} student(s)
              </span>
            </div>
            <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3">
              {cls.sections.length === 0 ? (
                <p className="text-sm text-foreground-muted">No sections yet.</p>
              ) : (
                cls.sections.map((s) => (
                  <SectionCard
                    key={s.sectionId}
                    href={attendanceUrl(cls.className, s.sectionId, s.sectionName)}
                    name={s.sectionName}
                    enrolled={s.enrolled}
                    recorded={loading ? null : sectionDays.get(s.sectionId)?.size ?? 0}
                    schoolDays={schoolDays.length}
                    today={
                      todayStatus?.markedSectionIds.includes(s.sectionId)
                        ? "marked"
                        : todayStatus?.draftSectionIds.includes(s.sectionId)
                          ? "draft"
                          : "none"
                    }
                  />
                ))
              )}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

function SessionFlag({ label, on }: { label: string; on: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
        on ? "bg-success-soft text-success" : "bg-surface text-foreground-muted"
      }`}
    >
      {on ? <CheckCircle2 className="size-3.5" /> : <Circle className="size-3.5" />}
      {label}
      <span className="sr-only">{on ? "recorded" : "not recorded"}</span>
    </span>
  );
}

function SectionCard({
  href,
  name,
  enrolled,
  recorded,
  schoolDays,
  today,
}: {
  href: string;
  name: string;
  enrolled: number;
  recorded: number | null;
  schoolDays: number;
  today: "marked" | "draft" | "none";
}) {
  const pct = recorded !== null && schoolDays > 0 ? Math.round((recorded / schoolDays) * 100) : 0;
  return (
    <Link
      href={href}
      className="group block rounded-xl border border-border bg-background p-4 transition-all hover:border-accent hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-semibold text-foreground">Section {name}</p>
          <p className="mt-0.5 flex items-center gap-1.5 text-sm text-foreground-soft">
            <Users className="size-3.5" /> {enrolled} student(s)
          </p>
        </div>
        {today === "marked" ? (
          <Badge tone="success">Marked today</Badge>
        ) : today === "draft" ? (
          <Badge tone="warning">Draft</Badge>
        ) : (
          <Badge tone="neutral">Not marked</Badge>
        )}
      </div>
      <div className="mt-4">
        <div className="flex items-baseline justify-between text-xs">
          <span className="text-foreground-muted">Days recorded this month</span>
          <span className="font-semibold tabular-nums text-foreground">{recorded === null ? "—" : `${recorded}/${schoolDays}`}</span>
        </div>
        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface">
          <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${pct}%` }} />
        </div>
      </div>
      <p className="mt-3 flex items-center gap-1 text-sm font-medium text-accent">
        Take attendance <ChevronRight className="size-4 transition-transform group-hover:translate-x-0.5" />
      </p>
    </Link>
  );
}
