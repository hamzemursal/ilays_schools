"use client";

import { use, useEffect, useState } from "react";
import { useAuth, ApiError } from "@/lib/auth-context";
import { api, type DashboardSummary } from "@/lib/api";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { Alert } from "@/components/ui/Alert";
import { SkeletonCards } from "@/components/ui/Skeleton";
import { GraduationCap, ShieldCheck, UserSquare2, Users, Wallet } from "lucide-react";

export default function SchoolDashboardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: schoolId } = use(params);
  const { user, accessToken } = useAuth();

  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken) return;
    api
      .getDashboardSummary(accessToken, schoolId)
      .then(setSummary)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load dashboard"));
  }, [accessToken, schoolId]);

  const schoolName = user?.schools.find((s) => s.id === schoolId)?.name ?? "School";

  return (
    <div>
      <PageHeader eyebrow="Dashboard" title={schoolName} breadcrumbs={[{ label: "Dashboard" }]} />

      <div className="p-4 sm:p-6">
        {error ? (
          <Alert tone="danger">{error}</Alert>
        ) : !summary ? (
          <SkeletonCards count={5} />
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <StatCard icon={Users} label="Active students" value={summary.studentCount} />
            <StatCard icon={UserSquare2} label="Teachers" value={summary.teacherCount} />
            <StatCard icon={GraduationCap} label="Classes" value={summary.classCount} />
            <StatCard
              icon={ShieldCheck}
              label="Attendance today"
              value={summary.attendanceTodayPercent === null ? "—" : `${summary.attendanceTodayPercent}%`}
              hint={summary.attendanceMarkedCount === 0 ? "Not marked yet" : `${summary.attendanceMarkedCount} marked`}
              tone={summary.attendanceTodayPercent !== null && summary.attendanceTodayPercent < 80 ? "warning" : "success"}
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
      </div>
    </div>
  );
}
