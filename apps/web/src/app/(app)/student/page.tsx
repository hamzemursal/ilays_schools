"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth, ApiError } from "@/lib/auth-context";
import { api, type MyChildAttendance, type MyChildInvoice, type MyChildResult } from "@/lib/api";
import { useStudentProfile } from "@/features/student-portal/useStudentProfile";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Alert } from "@/components/ui/Alert";
import { StatCard } from "@/components/ui/StatCard";
import { SkeletonCards } from "@/components/ui/Skeleton";
import {
  Award,
  CalendarCheck,
  CalendarDays,
  CalendarX,
  Clock,
  GraduationCap,
  Percent,
  ShieldCheck,
  Wallet,
} from "lucide-react";

export default function StudentDashboardPage() {
  const { accessToken } = useAuth();
  const { profile, error: profileError } = useStudentProfile();

  const [attendance, setAttendance] = useState<MyChildAttendance | null>(null);
  const [invoices, setInvoices] = useState<MyChildInvoice[] | null>(null);
  const [results, setResults] = useState<MyChildResult[] | null>(null);
  const [widgetsError, setWidgetsError] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken || !profile) return;
    const fail = (err: unknown) =>
      setWidgetsError((prev) => prev ?? (err instanceof ApiError ? err.message : "Failed to load some dashboard data"));

    api.getMyStudentAttendance(accessToken, profile.enrollment.academicYearId).then(setAttendance).catch(fail);
    api.getMyStudentInvoices(accessToken).then(setInvoices).catch(fail);
    api.getMyStudentResults(accessToken).then(setResults).catch(fail);
  }, [accessToken, profile]);

  if (profileError) {
    return (
      <div className="p-4 sm:p-6">
        <Alert tone="danger">{profileError}</Alert>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="p-4 sm:p-6">
        <SkeletonCards count={6} />
      </div>
    );
  }

  const totalOutstanding = invoices?.reduce((sum, i) => sum + i.balance, 0) ?? 0;
  const totalPaid = invoices?.reduce((sum, i) => sum + i.paid, 0) ?? 0;
  const approvedResults = results ?? [];
  const academicAverage =
    approvedResults.length > 0
      ? Math.round((approvedResults.reduce((sum, r) => sum + r.percentage, 0) / approvedResults.length) * 10) / 10
      : null;

  return (
    <div>
      <PageHeader
        eyebrow="Student Portal"
        title={`Welcome back, ${profile.firstName}`}
        description={`${profile.loginId} · ${profile.enrollment.className} · Section ${profile.enrollment.sectionName}`}
      />

      <div className="space-y-5 p-4 sm:p-6">
        {widgetsError && <Alert tone="danger">{widgetsError}</Alert>}

        <Card>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent">
                <GraduationCap className="size-6" />
              </div>
              <div>
                <p className="font-semibold text-foreground">
                  {profile.firstName} {profile.lastName}
                </p>
                <p className="text-sm text-foreground-soft">{profile.enrollment.schoolName}</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="accent">Academic Year {profile.enrollment.academicYearName}</Badge>
              <Badge tone={profile.enrollment.status === "ACTIVE" ? "success" : "neutral"}>
                {profile.enrollment.status}
              </Badge>
            </div>
          </div>
        </Card>

        {!attendance ? (
          <SkeletonCards count={5} />
        ) : attendance.summary.total === 0 ? (
          <Alert tone="info">No attendance has been recorded yet this academic year.</Alert>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <StatCard
              icon={Percent}
              label="Rate"
              value={attendance.summary.percentage !== null ? `${attendance.summary.percentage}%` : "—"}
              tone={
                attendance.summary.percentage !== null && attendance.summary.percentage < 80 ? "warning" : "success"
              }
            />
            <StatCard icon={CalendarCheck} label="Present" value={attendance.summary.present} tone="success" />
            <StatCard icon={CalendarX} label="Absent" value={attendance.summary.absent} tone="danger" />
            <StatCard icon={Clock} label="Late" value={attendance.summary.late} tone="warning" />
            <StatCard icon={ShieldCheck} label="Excused" value={attendance.summary.excused} tone="neutral" />
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {academicAverage !== null && (
            <Link href="/student/results">
              <Card className="h-full transition-colors hover:border-accent">
                <div className="flex items-center gap-3">
                  <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">
                    <Award className="size-4.5" />
                  </div>
                  <p className="text-xs font-medium uppercase tracking-wide text-foreground-muted">
                    Academic average
                  </p>
                </div>
                <p className="mt-3 text-2xl font-semibold tabular-nums text-foreground">{academicAverage}%</p>
                <p className="mt-0.5 text-xs text-foreground-soft">
                  Across {approvedResults.length} approved result{approvedResults.length === 1 ? "" : "s"}
                </p>
              </Card>
            </Link>
          )}

          {invoices && invoices.length > 0 && (
            <Link href="/student/fees">
              <Card className="h-full transition-colors hover:border-accent">
                <div className="flex items-center gap-3">
                  <div
                    className={`flex size-9 shrink-0 items-center justify-center rounded-lg ${
                      totalOutstanding > 0 ? "bg-warning-soft text-warning" : "bg-success-soft text-success"
                    }`}
                  >
                    <Wallet className="size-4.5" />
                  </div>
                  <p className="text-xs font-medium uppercase tracking-wide text-foreground-muted">
                    {totalOutstanding > 0 ? "Outstanding fees" : "Fees"}
                  </p>
                </div>
                <p className="mt-3 text-2xl font-semibold tabular-nums text-foreground">
                  {totalOutstanding > 0 ? totalOutstanding.toFixed(2) : "All paid"}
                </p>
                <p className="mt-0.5 text-xs text-foreground-soft">{totalPaid.toFixed(2)} paid to date</p>
              </Card>
            </Link>
          )}
        </div>

        {attendance && attendance.summary.total > 0 && (
          <div className="flex items-center gap-2 text-xs text-foreground-muted">
            <CalendarDays className="size-3.5" />
            Showing {profile.enrollment.academicYearName} data. Switch academic years on the Attendance page for
            history.
          </div>
        )}
      </div>
    </div>
  );
}
