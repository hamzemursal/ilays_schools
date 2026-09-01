"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  BookUser,
  Building2,
  GraduationCap,
  ScrollText,
  ShieldCheck,
  Users,
  Wallet,
} from "lucide-react";
import { useAuth, ApiError } from "@/lib/auth-context";
import { api, type DashboardSummary } from "@/lib/api";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Alert } from "@/components/ui/Alert";
import { SkeletonCards } from "@/components/ui/Skeleton";
import { SuperAdminDashboard } from "@/features/dashboard/SuperAdminDashboard";

export default function DashboardPage() {
  const router = useRouter();
  const { user, accessToken, loading } = useAuth();
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [summaryError, setSummaryError] = useState<string | null>(null);

  const isTeacher = user?.roles.includes("TEACHER") ?? false;
  const primarySchool = user?.schools[0];
  const hasSchoolDashboard = !!primarySchool && (user?.permissions.includes("academic.view") ?? false);
  // An org-wide account (Super Admin / Organization Admin) never has a
  // UserSchool row, so user.schools is always empty for it — the same
  // signal the "Authorized schools" card below already uses. schools.view
  // is the permission that actually grants the system-wide summary
  // endpoint, so gating on both keeps this exact to "can see every school."
  const isSystemAdmin = !!user && user.schools.length === 0 && user.permissions.includes("schools.view");

  const isStudent = user?.roles.includes("STUDENT") ?? false;

  useEffect(() => {
    if (!loading && !user) router.push("/login");
  }, [loading, user, router]);

  // A Student Portal account has its own dedicated dashboard, distinct from
  // every other role here — never the generic per-school summary or org
  // overview, both of which would otherwise show its synthetic login email
  // and no student-relevant content at all.
  useEffect(() => {
    if (isStudent) router.replace("/student");
  }, [isStudent, router]);

  useEffect(() => {
    if (!accessToken || !primarySchool || !hasSchoolDashboard) return;
    api
      .getDashboardSummary(accessToken, primarySchool.id)
      .then(setSummary)
      .catch((err) => setSummaryError(err instanceof ApiError ? err.message : "Failed to load summary"));
  }, [accessToken, primarySchool, hasSchoolDashboard]);

  if (loading || !user || isStudent) return null;

  const quickLinks = [
    primarySchool &&
      user.permissions.includes("students.view") && {
        label: "Students",
        href: `/schools/${primarySchool.id}/students`,
        icon: Users,
      },
    primarySchool &&
      user.permissions.includes("teachers.view") && {
        label: "Teachers",
        href: `/schools/${primarySchool.id}/teachers`,
        icon: BookUser,
      },
    primarySchool &&
      (user.permissions.includes("fees.manage") || user.permissions.includes("payments.record")) && {
        label: "Finance",
        href: `/schools/${primarySchool.id}/finance`,
        icon: Wallet,
      },
    primarySchool &&
      user.permissions.includes("audit.view") && {
        label: "Audit log",
        href: `/schools/${primarySchool.id}/audit-log`,
        icon: ScrollText,
      },
    isTeacher && { label: "My classes", href: "/my-classes", icon: GraduationCap },
    user.permissions.includes("schools.view") && { label: "Schools", href: "/schools", icon: Building2 },
  ].filter((x): x is { label: string; href: string; icon: typeof Users } => Boolean(x));

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
      <PageHeader
        eyebrow={isSystemAdmin ? "System overview" : "Overview"}
        title={`Welcome back${primarySchool ? `, ${primarySchool.name}` : ""}`}
        description={user.email}
      />

      <div className="mt-6 space-y-6">
        {isSystemAdmin && <SuperAdminDashboard />}

        {!isSystemAdmin && hasSchoolDashboard && (
          <section>
            {summaryError ? (
              <Alert tone="danger">{summaryError}</Alert>
            ) : !summary ? (
              <SkeletonCards count={5} />
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                <StatCard icon={Users} label="Students" value={summary.counts.students} />
                <StatCard icon={BookUser} label="Teachers" value={summary.counts.teachers} />
                <StatCard icon={GraduationCap} label="Classes" value={summary.counts.classes} />
                <StatCard
                  icon={ShieldCheck}
                  label="Attendance today"
                  value={summary.attendanceToday.percent === null ? "—" : `${summary.attendanceToday.percent}%`}
                  hint={summary.attendanceToday.marked === 0 ? "Not marked yet" : `${summary.attendanceToday.marked} marked`}
                  tone={summary.attendanceToday.percent !== null && summary.attendanceToday.percent < 80 ? "warning" : "success"}
                />
                <StatCard
                  icon={Wallet}
                  label="Outstanding fees"
                  value={`$${summary.outstandingFeesTotal.toFixed(2)}`}
                  hint={`${summary.outstandingInvoiceCount} invoice(s)`}
                  tone={summary.outstandingFeesTotal > 0 ? "warning" : "success"}
                />
              </div>
            )}
          </section>
        )}

        {!isSystemAdmin && quickLinks.length > 0 && (
          <section>
            <h2 className="mb-3 text-sm font-semibold text-foreground">Quick links</h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {quickLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="group flex items-center gap-3 rounded-xl border border-border bg-background p-4 shadow-sm transition-colors hover:border-accent"
                >
                  <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">
                    <link.icon className="size-4.5" />
                  </div>
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">{link.label}</span>
                  <ArrowRight className="size-4 shrink-0 text-foreground-muted transition-transform group-hover:translate-x-0.5 group-hover:text-accent" />
                </Link>
              ))}
            </div>
          </section>
        )}

        <Card padding="none">
          <div className="border-b border-border px-5 py-4">
            <h2 className="text-sm font-semibold text-foreground">Your account</h2>
          </div>
          <div className="grid gap-4 p-5 sm:grid-cols-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-foreground-muted">Roles</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {user.roles.map((role) => (
                  <Badge key={role} tone="accent">
                    {role}
                  </Badge>
                ))}
              </div>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-foreground-muted">
                Authorized schools
              </p>
              {user.schools.length === 0 ? (
                <p className="mt-2 text-sm text-foreground-soft">Organization-wide access.</p>
              ) : (
                <p className="mt-2 text-sm text-foreground">{user.schools.map((s) => s.name).join(", ")}</p>
              )}
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
