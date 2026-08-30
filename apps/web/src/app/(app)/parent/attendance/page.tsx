"use client";

import { useEffect, useState } from "react";
import { useAuth, ApiError } from "@/lib/auth-context";
import { api, type MyChildAttendance } from "@/lib/api";
import { useSelectedChild } from "@/features/parent-portal/SelectedChildContext";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Alert } from "@/components/ui/Alert";
import { EmptyState } from "@/components/ui/EmptyState";
import { SkeletonCards } from "@/components/ui/Skeleton";
import { ClipboardCheck, Users } from "lucide-react";

const STATUS_TONE: Record<string, "success" | "danger" | "warning" | "neutral"> = {
  PRESENT: "success",
  ABSENT: "danger",
  LATE: "warning",
  EXCUSED: "neutral",
};

export default function ParentAttendancePage() {
  const { accessToken } = useAuth();
  const { selectedChild, loading: childrenLoading, children } = useSelectedChild();

  return (
    <div>
      <PageHeader eyebrow="Parent Portal" title="Attendance" description="Daily attendance history and summary." />

      <div className="space-y-5 p-4 sm:p-6">
        {childrenLoading ? (
          <SkeletonCards count={2} />
        ) : children.length === 0 ? (
          <EmptyState icon={Users} title="No children linked yet" />
        ) : !selectedChild || !accessToken ? (
          <EmptyState icon={Users} title="Select a child above" />
        ) : (
          <AttendanceContent key={selectedChild.studentId} accessToken={accessToken} studentId={selectedChild.studentId} />
        )}
      </div>
    </div>
  );
}

function AttendanceContent({ accessToken, studentId }: { accessToken: string; studentId: string }) {
  const [data, setData] = useState<MyChildAttendance | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .getMyChildAttendance(accessToken, studentId)
      .then(setData)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load attendance"));
  }, [accessToken, studentId]);

  if (error) return <Alert tone="danger">{error}</Alert>;
  if (!data) return <SkeletonCards count={2} />;

  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <SummaryStat label="Present" value={data.summary.present} tone="success" />
        <SummaryStat label="Absent" value={data.summary.absent} tone="danger" />
        <SummaryStat label="Late" value={data.summary.late} tone="warning" />
        <SummaryStat label="Excused" value={data.summary.excused} tone="neutral" />
        <SummaryStat
          label="Attendance %"
          value={data.summary.percentage !== null ? `${data.summary.percentage}%` : "—"}
          tone="accent"
        />
      </div>

      <Card padding="none">
        {data.records.length === 0 ? (
          <div className="p-5">
            <EmptyState icon={ClipboardCheck} title="No attendance recorded yet" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] text-left text-sm">
              <thead className="bg-surface-soft text-xs font-semibold uppercase tracking-wide text-foreground-muted">
                <tr>
                  <th className="px-5 py-2.5">Date</th>
                  <th className="px-5 py-2.5">Class / Section</th>
                  <th className="px-5 py-2.5">Status</th>
                  <th className="px-5 py-2.5">Note</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {data.records.map((r) => (
                  <tr key={r.id}>
                    <td className="px-5 py-3 text-foreground">{new Date(r.date).toLocaleDateString()}</td>
                    <td className="px-5 py-3 text-foreground-soft">
                      {r.className} · {r.sectionName}
                    </td>
                    <td className="px-5 py-3">
                      <Badge tone={STATUS_TONE[r.status]}>{r.status}</Badge>
                    </td>
                    <td className="px-5 py-3 text-foreground-muted">{r.note ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}

function SummaryStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string | number;
  tone: "success" | "danger" | "warning" | "neutral" | "accent";
}) {
  const toneClass: Record<typeof tone, string> = {
    success: "text-success",
    danger: "text-danger",
    warning: "text-warning",
    neutral: "text-foreground-soft",
    accent: "text-accent",
  };
  return (
    <Card padding="sm" className="text-center">
      <p className={`text-2xl font-semibold ${toneClass[tone]}`}>{value}</p>
      <p className="mt-1 text-xs font-medium uppercase tracking-wide text-foreground-muted">{label}</p>
    </Card>
  );
}
