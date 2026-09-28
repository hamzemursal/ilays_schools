"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useAuth, ApiError } from "@/lib/auth-context";
import { api, type DashboardSummary } from "@/lib/api";
import { Card, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Alert } from "@/components/ui/Alert";
import { SkeletonCards } from "@/components/ui/Skeleton";
import {
  AlertTriangle,
  BookOpen,
  CalendarCheck,
  CalendarDays,
  CheckCircle2,
  GraduationCap,
  Layers,
  UserRound,
  UserSquare2,
  Users,
  Wallet,
} from "lucide-react";
import { schoolNavItems } from "@/components/layout/nav-config";
import { AttendanceRing, DashboardPanel, KpiCard, MetricStrip } from "@/features/dashboard/school/DashboardCards";

const SETUP_STEPS: { key: keyof DashboardSummary["setup"]; label: string; href: (schoolId: string) => string }[] = [
  { key: "academicYear", label: "Academic Year", href: (id) => `/schools/${id}/academic` },
  { key: "classes", label: "Classes", href: (id) => `/schools/${id}/academic` },
  { key: "sections", label: "Sections", href: (id) => `/schools/${id}/academic` },
  { key: "subjects", label: "Subjects", href: (id) => `/schools/${id}/academic` },
  { key: "teacherAssignments", label: "Teacher Assignments", href: (id) => `/schools/${id}/teachers` },
  { key: "studentEnrollment", label: "Student Enrollment", href: (id) => `/schools/${id}/students` },
];

export default function SchoolDashboardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: schoolId } = use(params);
  const { user, accessToken } = useAuth();

  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [academicYearId, setAcademicYearId] = useState<string | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken) return;
    api
      .getDashboardSummary(accessToken, schoolId, academicYearId)
      .then((data) => {
        setSummary(data);
        if (!academicYearId && data.academicYear) setAcademicYearId(data.academicYear.id);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load dashboard"));
    // academicYearId is intentionally omitted here for the initial load — it's
    // set FROM the response above; re-fetching is handled by the effect below
    // once the admin actually changes the selector.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken, schoolId]);

  useEffect(() => {
    if (!accessToken || !academicYearId) return;
    api
      .getDashboardSummary(accessToken, schoolId, academicYearId)
      .then(setSummary)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load dashboard"));
  }, [accessToken, schoolId, academicYearId]);

  const schoolName = user?.schools.find((s) => s.id === schoolId)?.name ?? "School";

  // "View details" links only for pages this user can already open — the
  // exact same permission rules the sidebar uses (nav-config).
  const allowed = new Set(user ? schoolNavItems(user, schoolId).map((i) => i.href) : []);
  const linkTo = (path: string) => {
    const href = `/schools/${schoolId}/${path}`;
    return allowed.has(href) ? href : undefined;
  };

  return (
    <div className="space-y-6 px-3 pb-8 pt-5 sm:px-5 sm:pt-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <nav aria-label="Breadcrumb" className="text-sm text-foreground-soft">
            Dashboard
          </nav>
          <h1 className="mt-2 text-balance text-2xl font-bold tracking-tight text-foreground sm:text-3xl">Welcome back, {schoolName}</h1>
          <p className="mt-1 text-sm text-foreground-soft">Here&apos;s what&apos;s happening in your school today.</p>
        </div>
        {summary && summary.academicYears.length > 0 && (
          <label className="flex items-center gap-3 rounded-2xl border border-border bg-background px-4 py-2.5 shadow-sm">
            <span className="flex size-9 items-center justify-center rounded-xl bg-accent-soft text-accent">
              <CalendarDays className="size-4.5" />
            </span>
            <span className="flex flex-col">
              <span className="text-[11px] font-medium text-foreground-muted">Academic Year</span>
              <select
                value={academicYearId}
                onChange={(e) => setAcademicYearId(e.target.value)}
                aria-label="Academic year"
                className="-ml-1 cursor-pointer rounded bg-transparent pr-1 text-sm font-semibold text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
              >
                {summary.academicYears.map((y) => (
                  <option key={y.id} value={y.id}>
                    {y.name}
                    {y.isCurrent ? " (current)" : ""}
                  </option>
                ))}
              </select>
            </span>
          </label>
        )}
      </div>

      {error ? (
        <Alert tone="danger">{error}</Alert>
      ) : !summary ? (
        <SkeletonCards count={6} />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard icon={Users} tone="blue" label="Students" value={summary.counts.students} caption="Active students" href={linkTo("students")} />
            <KpiCard
              icon={UserSquare2}
              tone="green"
              label="Teachers"
              value={summary.counts.teachers}
              caption="Active teachers"
              href={linkTo("teachers")}
            />
            <KpiCard icon={GraduationCap} tone="violet" label="Classes" value={summary.counts.classes} caption="Total classes" href={linkTo("academic")} />
            <KpiCard icon={Layers} tone="amber" label="Sections" value={summary.counts.sections} caption="Total sections" href={linkTo("academic")} />
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <DashboardPanel
              icon={Users}
              title="Student enrollment"
              description={summary.academicYear ? `Active enrollment for ${summary.academicYear.name}` : "No academic year yet"}
              href={linkTo("students")}
            >
              <MetricStrip
                items={[
                  { icon: Users, value: summary.enrollment.total, label: "Total" },
                  { icon: UserRound, value: summary.enrollment.male, label: "Male", iconClassName: "text-accent" },
                  { icon: UserRound, value: summary.enrollment.female, label: "Female", iconClassName: "text-violet-600" },
                ]}
              />
            </DashboardPanel>

            <DashboardPanel icon={UserSquare2} title="Teachers" description="By employment status." href={linkTo("teachers")}>
              <MetricStrip
                items={[
                  { icon: Users, value: summary.teachers.active, label: "Active", valueClassName: "text-success", iconClassName: "text-success" },
                  {
                    icon: Users,
                    value: summary.teachers.inactive,
                    label: "Inactive / on leave",
                    valueClassName: "text-foreground-soft",
                    iconClassName: "text-foreground-muted",
                  },
                ]}
              />
            </DashboardPanel>

            <DashboardPanel icon={BookOpen} title="Academic" description="Current structure on file." href={linkTo("academic")}>
              <dl className="grid grid-cols-2 gap-4 rounded-xl bg-surface-soft p-4 2xl:grid-cols-[1.6fr_1fr_1fr_1fr] 2xl:gap-0 2xl:divide-x 2xl:divide-border">
                <Field icon={CalendarDays} label="Year" value={summary.academicYear?.name ?? "—"} />
                <Field icon={GraduationCap} label="Classes" value={String(summary.counts.classes)} />
                <Field icon={Layers} label="Sections" value={String(summary.counts.sections)} />
                <Field icon={BookOpen} label="Subjects" value={String(summary.counts.subjects)} />
              </dl>
            </DashboardPanel>

            <DashboardPanel
              icon={CalendarCheck}
              title="Attendance overview"
              description="Today&apos;s marks across the whole school."
              href={linkTo("attendance")}
            >
              <div className="flex flex-col items-center gap-4 sm:flex-row">
                <AttendanceRing percent={summary.attendanceToday.percent} />
                <dl className="grid w-full grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-0 sm:divide-x sm:divide-border">
                  <AttendanceStat dot="bg-success" value={summary.attendanceToday.present} label="Present" />
                  <AttendanceStat dot="bg-danger" value={summary.attendanceToday.absent} label="Absent" />
                  <AttendanceStat dot="bg-warning" value={summary.attendanceToday.late} label="Late" />
                  <AttendanceStat dot="bg-accent" value={summary.attendanceToday.excused} label="Excused" />
                </dl>
              </div>
              <p className="mt-3 text-xs text-foreground-muted">
                {summary.attendanceToday.marked === 0 ? "Not marked yet today." : `${summary.attendanceToday.marked} marks recorded today.`}
              </p>
            </DashboardPanel>
          </div>

          <DashboardPanel icon={Wallet} title="Outstanding fees" description="Total pending invoices across the school." href={linkTo("finance")}>
            <p
              data-testid="outstanding-fees"
              className={`text-3xl font-bold tabular-nums ${summary.outstandingFeesTotal > 0 ? "text-warning" : "text-foreground"}`}
            >
              ${summary.outstandingFeesTotal.toFixed(2)}
            </p>
            <p className="mt-1 text-sm text-foreground-soft">{summary.outstandingInvoiceCount} invoice(s)</p>
          </DashboardPanel>

          {summary.setup.progressPercent < 100 && (
            <Card padding="none" className="rounded-2xl">
              <CardHeader
                title="School setup"
                description="Complete these to get the school fully up and running."
                actions={<Badge tone={summary.setup.progressPercent === 100 ? "success" : "accent"}>{summary.setup.progressPercent}%</Badge>}
              />
              <div className="p-5">
                <div className="mb-4 h-2 overflow-hidden rounded-full bg-surface">
                  <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${summary.setup.progressPercent}%` }} />
                </div>
                <ul className="space-y-2">
                  {SETUP_STEPS.map((step) => {
                    const done = summary.setup[step.key] as boolean;
                    return (
                      <li key={step.key} className="flex items-center gap-2 text-sm">
                        {done ? (
                          <CheckCircle2 className="size-4 shrink-0 text-success" />
                        ) : (
                          <AlertTriangle className="size-4 shrink-0 text-warning" />
                        )}
                        <span className={done ? "text-foreground-soft line-through" : "text-foreground"}>{step.label}</span>
                        {!done && (
                          <Link href={step.href(schoolId)} className="ml-auto text-xs font-medium text-accent hover:underline">
                            Set up →
                          </Link>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

function AttendanceStat({ dot, value, label }: { dot: string; value: number; label: string }) {
  return (
    <div className="text-center">
      <dd className="flex items-center justify-center gap-2 text-lg font-bold tabular-nums text-foreground">
        <span className={`size-2.5 rounded-full ${dot}`} aria-hidden />
        {value}
      </dd>
      <dt className="text-xs text-foreground-muted">{label}</dt>
    </div>
  );
}

function Field({ icon: Icon, label, value }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string }) {
  return (
    <div className="flex min-w-0 items-center gap-2.5 2xl:px-4 2xl:first:pl-0">
      <Icon className="size-5 shrink-0 text-accent" />
      <div className="min-w-0">
        <dt className="truncate text-[11px] font-semibold uppercase tracking-wide text-foreground-muted">{label}</dt>
        <dd className="truncate text-base font-bold text-foreground">{value}</dd>
      </div>
    </div>
  );
}
