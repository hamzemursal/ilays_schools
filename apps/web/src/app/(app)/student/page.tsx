"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { useAuth, ApiError } from "@/lib/auth-context";
import { api, type MyChildAttendance, type MyChildInvoice, type MyChildResult } from "@/lib/api";
import { useStudentProfile } from "@/features/student-portal/useStudentProfile";
import { StatTile, rateLabel } from "@/features/student-portal/StatTile";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Alert } from "@/components/ui/Alert";
import { Avatar } from "@/components/ui/Avatar";
import { SkeletonCards } from "@/components/ui/Skeleton";
import {
  Award,
  Building2,
  CalendarCheck,
  CalendarDays,
  CalendarX,
  Clock,
  GraduationCap,
  IdCard,
  Percent,
  ShieldCheck,
  Users2,
  Wallet,
} from "lucide-react";

function InfoItem({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <Icon className="size-3.5 shrink-0 text-foreground-muted" />
      <span className="text-foreground-muted">{label}:</span>
      <span className="font-medium text-foreground">{value}</span>
    </div>
  );
}

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
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-col items-center gap-4 text-center sm:flex-row sm:items-center sm:text-left">
              <Avatar name={`${profile.firstName} ${profile.lastName}`} size="xl" />
              <div>
                <div className="flex flex-wrap items-center justify-center gap-2 sm:justify-start">
                  <p className="text-lg font-semibold text-foreground">
                    {profile.firstName} {profile.lastName}
                  </p>
                  <Badge tone={profile.enrollment.status === "ACTIVE" ? "success" : "neutral"}>
                    {profile.enrollment.status}
                  </Badge>
                </div>
                <div className="mt-2 grid grid-cols-1 gap-x-6 gap-y-1.5 text-sm text-foreground-soft sm:grid-cols-2">
                  <InfoItem icon={IdCard} label="Student ID" value={profile.loginId} />
                  <InfoItem icon={GraduationCap} label="Class" value={profile.enrollment.className} />
                  <InfoItem icon={Users2} label="Section" value={profile.enrollment.sectionName} />
                  <InfoItem icon={Building2} label="School" value={profile.enrollment.schoolName} />
                  <InfoItem icon={CalendarDays} label="Academic Year" value={profile.enrollment.academicYearName} />
                </div>
              </div>
            </div>

            {academicAverage !== null && (
              <Link
                href="/student/results"
                className="flex shrink-0 flex-col items-center gap-1 rounded-xl bg-accent-soft px-6 py-4 text-center transition-colors hover:bg-accent-soft/70"
              >
                <Award className="size-5 text-accent" />
                <p className="text-xs font-medium uppercase tracking-wide text-accent">Academic Average</p>
                <p className="text-3xl font-semibold tabular-nums text-accent">{academicAverage}%</p>
                <p className="text-xs text-accent/80">
                  {approvedResults.length} approved result{approvedResults.length === 1 ? "" : "s"} · View Details →
                </p>
              </Link>
            )}
          </div>
        </Card>

        {!attendance ? (
          <SkeletonCards count={5} />
        ) : attendance.summary.total === 0 ? (
          <Alert tone="info">No attendance has been recorded yet this academic year.</Alert>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {(() => {
              const rate = attendance.summary.percentage !== null ? rateLabel(attendance.summary.percentage) : null;
              return (
                <StatTile
                  icon={Percent}
                  label="Attendance Rate"
                  value={attendance.summary.percentage !== null ? `${attendance.summary.percentage}%` : "—"}
                  tone={rate?.tone ?? "accent"}
                  badge={rate && <Badge tone={rate.tone}>{rate.text}</Badge>}
                />
              );
            })()}
            <StatTile icon={CalendarCheck} label="Present" value={attendance.summary.present} unit="days" tone="success" />
            <StatTile icon={CalendarX} label="Absent" value={attendance.summary.absent} unit="days" tone="danger" />
            <StatTile icon={Clock} label="Late" value={attendance.summary.late} unit="days" tone="warning" />
            <StatTile icon={ShieldCheck} label="Excused" value={attendance.summary.excused} unit="days" tone="accent" />
            <StatTile icon={CalendarDays} label="Total Days" value={attendance.summary.total} unit="days" tone="accent" />
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
