"use client";

import { useEffect, useState } from "react";
import { useAuth, ApiError } from "@/lib/auth-context";
import { api, type MyChildAcademicYear, type MyChildAttendance } from "@/lib/api";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Alert } from "@/components/ui/Alert";
import { EmptyState } from "@/components/ui/EmptyState";
import { SkeletonCards } from "@/components/ui/Skeleton";
import { StatCard } from "@/components/ui/StatCard";
import { Select } from "@/components/ui/FormControls";
import { CalendarCheck, CalendarDays, CalendarX, ClipboardCheck, Clock, Percent, ShieldCheck } from "lucide-react";

const STATUS_TONE: Record<string, "success" | "danger" | "warning" | "neutral"> = {
  PRESENT: "success",
  ABSENT: "danger",
  LATE: "warning",
  EXCUSED: "neutral",
};

export default function StudentAttendancePage() {
  const { accessToken } = useAuth();

  return (
    <div>
      <PageHeader eyebrow="Student Portal" title="Attendance" description="Your daily attendance record, by academic year." />

      <div className="space-y-5 p-4 sm:p-6">
        {!accessToken ? <SkeletonCards count={3} /> : <YearPicker accessToken={accessToken} />}
      </div>
    </div>
  );
}

function YearPicker({ accessToken }: { accessToken: string }) {
  const [years, setYears] = useState<MyChildAcademicYear[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedYearId, setSelectedYearId] = useState<string | null>(null);

  useEffect(() => {
    api
      .getMyStudentAcademicYears(accessToken)
      .then((list) => {
        setYears(list);
        setSelectedYearId(list.find((y) => y.isCurrent)?.id ?? list[0]?.id ?? null);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load academic years"));
  }, [accessToken]);

  if (error) return <Alert tone="danger">{error}</Alert>;
  if (!years) return <SkeletonCards count={3} />;
  if (years.length === 0) {
    return <EmptyState icon={CalendarDays} title="No academic year on record" />;
  }

  return (
    <>
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-foreground">Academic year</p>
            <p className="mt-0.5 text-sm text-foreground-soft">Choose a year to view its attendance record.</p>
          </div>
          <Select
            value={selectedYearId ?? ""}
            onChange={(e) => setSelectedYearId(e.target.value)}
            className="w-auto min-w-[180px]"
          >
            {years.map((y) => (
              <option key={y.id} value={y.id}>
                {y.name}
                {y.isCurrent ? " (Current)" : ""}
              </option>
            ))}
          </Select>
        </div>
      </Card>

      {selectedYearId && (
        <YearAttendance key={selectedYearId} accessToken={accessToken} academicYearId={selectedYearId} />
      )}
    </>
  );
}

function YearAttendance({ accessToken, academicYearId }: { accessToken: string; academicYearId: string }) {
  const [attendance, setAttendance] = useState<MyChildAttendance | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .getMyStudentAttendance(accessToken, academicYearId)
      .then(setAttendance)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load attendance"));
  }, [accessToken, academicYearId]);

  if (error) return <Alert tone="danger">{error}</Alert>;
  if (!attendance) return <SkeletonCards count={3} />;

  const { summary, records } = attendance;

  if (summary.total === 0) {
    return (
      <Card>
        <EmptyState
          icon={ClipboardCheck}
          title="No attendance records found for this academic year"
          description="Nothing has been marked for this academic year yet."
        />
      </Card>
    );
  }

  return (
    <>
      <Alert tone="info">
        This is your overall daily attendance — one record per school day. It is not currently separated by subject.
      </Alert>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <StatCard
          icon={Percent}
          label="Rate"
          value={summary.percentage !== null ? `${summary.percentage}%` : "—"}
          tone={summary.percentage !== null && summary.percentage < 80 ? "warning" : "success"}
        />
        <StatCard icon={CalendarCheck} label="Present" value={summary.present} tone="success" />
        <StatCard icon={CalendarX} label="Absent" value={summary.absent} tone="danger" />
        <StatCard icon={Clock} label="Late" value={summary.late} tone="warning" />
        <StatCard icon={ShieldCheck} label="Excused" value={summary.excused} tone="neutral" />
        <StatCard icon={CalendarDays} label="Total days" value={summary.total} tone="neutral" />
      </div>

      <Card padding="none">
        <CardHeader title="Daily attendance" description={`${records.length} day(s) recorded this year.`} />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead className="bg-surface-soft text-xs font-semibold uppercase tracking-wide text-foreground-muted">
              <tr>
                <th className="px-5 py-2.5">Date</th>
                <th className="px-5 py-2.5">Day</th>
                <th className="px-5 py-2.5">Class / Section</th>
                <th className="px-5 py-2.5">Status</th>
                <th className="px-5 py-2.5">Note</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {records.map((r) => {
                const d = new Date(r.date);
                return (
                  <tr key={r.id}>
                    <td className="px-5 py-3 whitespace-nowrap text-foreground">
                      {d.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" })}
                    </td>
                    <td className="px-5 py-3 whitespace-nowrap text-foreground-soft">
                      {d.toLocaleDateString(undefined, { weekday: "long" })}
                    </td>
                    <td className="px-5 py-3 whitespace-nowrap text-foreground-soft">
                      {r.className} · {r.sectionName}
                    </td>
                    <td className="px-5 py-3">
                      <Badge tone={STATUS_TONE[r.status]}>{r.status}</Badge>
                    </td>
                    <td className="px-5 py-3 text-foreground-muted">{r.note ?? "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
