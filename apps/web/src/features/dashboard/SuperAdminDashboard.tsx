"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  BookUser,
  Building2,
  CheckCircle2,
  History,
  Info,
  School as SchoolIcon,
  ShieldAlert,
  UserSquare2,
  Users,
} from "lucide-react";
import { useAuth, ApiError } from "@/lib/auth-context";
import { api, type SystemSummary } from "@/lib/api";
import { StatCard } from "@/components/ui/StatCard";
import { Card, CardHeader } from "@/components/ui/Card";
import { Alert } from "@/components/ui/Alert";
import { EmptyState } from "@/components/ui/EmptyState";
import { SkeletonCards } from "@/components/ui/Skeleton";

// The Super Admin's landing view — a system-wide overview across every
// school in the organization, computed entirely from the same
// School/StudentEnrollment/Teacher/Guardian/AuditLog relationships the rest
// of the app already uses (see SchoolsService.getSystemSummary). Rendered
// instead of the School Admin's per-school stats section in dashboard/page.tsx
// whenever the account has org-wide access (user.schools.length === 0) —
// deliberately a separate component so the two dashboards can never be
// confused with each other.
export function SuperAdminDashboard() {
  const { accessToken } = useAuth();
  const [summary, setSummary] = useState<SystemSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken) return;
    api
      .getSystemSummary(accessToken)
      .then(setSummary)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load system overview"));
  }, [accessToken]);

  if (error) return <Alert tone="danger">{error}</Alert>;
  if (!summary) return <SkeletonCards count={8} />;

  const { totals } = summary;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        <StatCard icon={Building2} label="Total schools" value={totals.schools} />
        <StatCard icon={SchoolIcon} label="Primary schools" value={totals.primarySchools} tone="teal" />
        <StatCard icon={SchoolIcon} label="Secondary schools" value={totals.secondarySchools} tone="violet" />
        <StatCard
          icon={CheckCircle2}
          label="Active schools"
          value={totals.activeSchools}
          tone={totals.inactiveSchools > 0 ? "warning" : "success"}
          hint={totals.inactiveSchools > 0 ? `${totals.inactiveSchools} inactive` : undefined}
        />
        <StatCard icon={Users} label="Total students" value={totals.students} />
        <StatCard icon={Users} label="Male students" value={totals.maleStudents} tone="teal" />
        <StatCard icon={Users} label="Female students" value={totals.femaleStudents} tone="violet" />
        <StatCard icon={BookUser} label="Total teachers" value={totals.teachers} tone="amber" />
        <StatCard icon={UserSquare2} label="Parents / guardians" value={totals.guardians} tone="violet" />
        <StatCard icon={ShieldAlert} label="Total staff" value={totals.staff} hint="Teachers — no separate staff records yet" />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="text-sm font-semibold text-foreground">Primary vs Secondary</h2>
          <p className="mt-0.5 text-xs text-foreground-muted">Schools offering each division (a combined school counts in both).</p>
          <div className="mt-4 space-y-3">
            <DistributionBar label="Primary" value={totals.primarySchools} total={totals.schools} />
            <DistributionBar label="Secondary" value={totals.secondarySchools} total={totals.schools} />
          </div>
        </Card>

        <Card>
          <h2 className="text-sm font-semibold text-foreground">Student enrollment — Male vs Female</h2>
          <p className="mt-0.5 text-xs text-foreground-muted">{totals.students} student(s) actively enrolled, organization-wide.</p>
          <div className="mt-4 space-y-3">
            <DistributionBar label="Male" value={totals.maleStudents} total={totals.students} />
            <DistributionBar label="Female" value={totals.femaleStudents} total={totals.students} />
          </div>
        </Card>
      </div>

      <Card padding="none">
        <CardHeader title="Schools overview" description="Active vs inactive across the organization." />
        <div className="p-5">
          <DistributionBar label="Active" value={totals.activeSchools} total={totals.schools} tone="success" />
          <div className="mt-3">
            <DistributionBar label="Inactive" value={totals.inactiveSchools} total={totals.schools} tone="danger" />
          </div>
          <Link href="/schools" className="mt-4 inline-block text-sm font-medium text-accent hover:underline">
            View all schools →
          </Link>
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card padding="none">
          <CardHeader title="System alerts" description="Setup gaps worth a look." />
          <div className="p-5">
            {summary.alerts.length === 0 ? (
              <EmptyState icon={CheckCircle2} title="All clear" description="No setup gaps detected across your schools." />
            ) : (
              <ul className="space-y-2">
                {summary.alerts.slice(0, 8).map((alert, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm">
                    {alert.severity === "warning" ? (
                      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
                    ) : (
                      <Info className="mt-0.5 size-4 shrink-0 text-foreground-muted" />
                    )}
                    <Link href={`/schools/${alert.schoolId}`} className="text-foreground-soft hover:text-accent hover:underline">
                      {alert.message}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Card>

        <Card padding="none">
          <CardHeader title="Recent system activity" description="Latest actions across every school." />
          <div className="p-5">
            {summary.recentActivity.length === 0 ? (
              <EmptyState icon={History} title="No activity yet" />
            ) : (
              <ul className="space-y-3">
                {summary.recentActivity.slice(0, 8).map((entry) => (
                  <li key={entry.id} className="text-sm">
                    <p className="text-foreground">
                      <span className="font-medium">{entry.actorEmail}</span>{" "}
                      <span className="text-foreground-soft">{entry.action}</span>
                    </p>
                    <p className="text-xs text-foreground-muted">{new Date(entry.createdAt).toLocaleString()}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}

function DistributionBar({
  label,
  value,
  total,
  tone = "accent",
}: {
  label: string;
  value: number;
  total: number;
  tone?: "accent" | "success" | "danger";
}) {
  const percent = total > 0 ? Math.round((value / total) * 100) : 0;
  const barClass = tone === "success" ? "bg-success" : tone === "danger" ? "bg-danger" : "bg-accent";
  return (
    <div>
      <div className="flex items-center justify-between text-xs text-foreground-soft">
        <span>{label}</span>
        <span className="tabular-nums">
          {value} ({percent}%)
        </span>
      </div>
      <div className="mt-1 h-2 overflow-hidden rounded-full bg-surface-soft">
        <div className={`h-full rounded-full ${barClass}`} style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}
