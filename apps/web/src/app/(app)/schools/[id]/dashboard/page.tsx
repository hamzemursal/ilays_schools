"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useAuth, ApiError } from "@/lib/auth-context";
import { api, type DashboardSummary } from "@/lib/api";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { Card, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Alert } from "@/components/ui/Alert";
import { Select } from "@/components/ui/FormControls";
import { SkeletonCards } from "@/components/ui/Skeleton";
import { AlertTriangle, BookOpen, CheckCircle2, GraduationCap, Layers, UserSquare2, Users, Wallet } from "lucide-react";

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

  return (
    <div>
      <PageHeader
        eyebrow="Dashboard"
        title={`Welcome back, ${schoolName}`}
        description={user?.email}
        breadcrumbs={[{ label: "Dashboard" }]}
        actions={
          summary && summary.academicYears.length > 0 ? (
            <Select value={academicYearId} onChange={(e) => setAcademicYearId(e.target.value)} className="w-auto">
              {summary.academicYears.map((y) => (
                <option key={y.id} value={y.id}>
                  {y.name}
                  {y.isCurrent ? " (current)" : ""}
                </option>
              ))}
            </Select>
          ) : undefined
        }
      />

      <div className="space-y-5 p-4 sm:p-6">
        {error ? (
          <Alert tone="danger">{error}</Alert>
        ) : !summary ? (
          <SkeletonCards count={6} />
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <StatCard icon={Users} label="Students" value={summary.counts.students} />
              <StatCard icon={UserSquare2} label="Teachers" value={summary.counts.teachers} />
              <StatCard icon={GraduationCap} label="Classes" value={summary.counts.classes} />
              <StatCard icon={Layers} label="Sections" value={summary.counts.sections} />
            </div>

            <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
              <Card padding="none">
                <CardHeader
                  title="Student enrollment"
                  description={summary.academicYear ? `Active enrollment for ${summary.academicYear.name}` : "No academic year yet"}
                />
                <div className="grid grid-cols-3 gap-4 p-5 text-center">
                  <div>
                    <p className="text-2xl font-semibold tabular-nums text-foreground">{summary.enrollment.total}</p>
                    <p className="text-xs font-medium uppercase tracking-wide text-foreground-muted">Total</p>
                  </div>
                  <div>
                    <p className="text-2xl font-semibold tabular-nums text-foreground">{summary.enrollment.male}</p>
                    <p className="text-xs font-medium uppercase tracking-wide text-foreground-muted">Male</p>
                  </div>
                  <div>
                    <p className="text-2xl font-semibold tabular-nums text-foreground">{summary.enrollment.female}</p>
                    <p className="text-xs font-medium uppercase tracking-wide text-foreground-muted">Female</p>
                  </div>
                </div>
              </Card>

              <Card padding="none">
                <CardHeader title="Teachers" description="By employment status." />
                <div className="grid grid-cols-2 gap-4 p-5 text-center">
                  <div>
                    <p className="text-2xl font-semibold tabular-nums text-success">{summary.teachers.active}</p>
                    <p className="text-xs font-medium uppercase tracking-wide text-foreground-muted">Active</p>
                  </div>
                  <div>
                    <p className="text-2xl font-semibold tabular-nums text-foreground-soft">{summary.teachers.inactive}</p>
                    <p className="text-xs font-medium uppercase tracking-wide text-foreground-muted">Inactive / on leave</p>
                  </div>
                </div>
              </Card>

              <Card padding="none">
                <CardHeader title="Academic" description="Current structure on file." />
                <div className="grid grid-cols-2 gap-4 p-5 sm:grid-cols-4">
                  <Field icon={GraduationCap} label="Year" value={summary.academicYear?.name ?? "—"} />
                  <Field icon={GraduationCap} label="Classes" value={String(summary.counts.classes)} />
                  <Field icon={Layers} label="Sections" value={String(summary.counts.sections)} />
                  <Field icon={BookOpen} label="Subjects" value={String(summary.counts.subjects)} />
                </div>
              </Card>

              <Card padding="none">
                <CardHeader title="Attendance overview" description="Today's marks across the whole school." />
                <div className="p-5">
                  <div className="mb-3 flex items-baseline gap-2">
                    <p className="text-2xl font-semibold tabular-nums text-foreground">
                      {summary.attendanceToday.percent === null ? "—" : `${summary.attendanceToday.percent}%`}
                    </p>
                    <p className="text-xs text-foreground-muted">
                      {summary.attendanceToday.marked === 0 ? "Not marked yet" : `${summary.attendanceToday.marked} marked present-rate`}
                    </p>
                  </div>
                  <div className="grid grid-cols-4 gap-2 text-center">
                    <div>
                      <p className="font-semibold tabular-nums text-success">{summary.attendanceToday.present}</p>
                      <p className="text-xs text-foreground-muted">Present</p>
                    </div>
                    <div>
                      <p className="font-semibold tabular-nums text-danger">{summary.attendanceToday.absent}</p>
                      <p className="text-xs text-foreground-muted">Absent</p>
                    </div>
                    <div>
                      <p className="font-semibold tabular-nums text-warning">{summary.attendanceToday.late}</p>
                      <p className="text-xs text-foreground-muted">Late</p>
                    </div>
                    <div>
                      <p className="font-semibold tabular-nums text-accent">{summary.attendanceToday.excused}</p>
                      <p className="text-xs text-foreground-muted">Excused</p>
                    </div>
                  </div>
                </div>
              </Card>
            </div>

            <StatCard
              icon={Wallet}
              label="Outstanding fees"
              value={`$${summary.outstandingFeesTotal.toFixed(2)}`}
              hint={`${summary.outstandingInvoiceCount} invoice(s)`}
              tone={summary.outstandingFeesTotal > 0 ? "warning" : "success"}
            />

            {summary.setup.progressPercent < 100 && (
              <Card padding="none">
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
    </div>
  );
}

function Field({ icon: Icon, label, value }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string }) {
  return (
    <div>
      <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-foreground-muted">
        <Icon className="size-3.5" /> {label}
      </p>
      <p className="mt-0.5 text-sm font-semibold text-foreground">{value}</p>
    </div>
  );
}
