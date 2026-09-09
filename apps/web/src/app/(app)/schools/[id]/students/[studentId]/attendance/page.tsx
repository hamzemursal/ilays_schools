"use client";

import { use, useEffect, useState } from "react";
import type { LucideIcon } from "lucide-react";
import { useAuth, ApiError } from "@/lib/auth-context";
import { api, type StudentAttendanceHistoryRecord, type StudentDetail } from "@/lib/api";
import { studentsApi } from "@/features/students/api";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Alert } from "@/components/ui/Alert";
import { EmptyState } from "@/components/ui/EmptyState";
import { SkeletonCards } from "@/components/ui/Skeleton";
import { Select } from "@/components/ui/FormControls";
import { AttendanceDonut } from "@/features/student-portal/AttendanceDonut";
import { StatTile, rateLabel } from "@/features/student-portal/StatTile";
import {
  CalendarCheck,
  CalendarDays,
  CalendarX,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  Percent,
  ShieldCheck,
  XCircle,
} from "lucide-react";

const STATUS_TONE: Record<string, "success" | "danger" | "warning" | "neutral"> = {
  PRESENT: "success",
  ABSENT: "danger",
  LATE: "warning",
  EXCUSED: "neutral",
};

const STATUS_ICON: Record<string, LucideIcon> = {
  PRESENT: CheckCircle2,
  ABSENT: XCircle,
  LATE: Clock,
  EXCUSED: ShieldCheck,
};

export default function StudentAttendanceHistoryPage({
  params,
}: {
  params: Promise<{ id: string; studentId: string }>;
}) {
  const { id: schoolId, studentId } = use(params);
  const { accessToken } = useAuth();

  const [student, setStudent] = useState<StudentDetail | null>(null);
  const [records, setRecords] = useState<StudentAttendanceHistoryRecord[] | null>(null);
  const [selectedYearId, setSelectedYearId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken) return;
    Promise.all([studentsApi.getOne(accessToken, studentId), api.getStudentAttendanceHistory(accessToken, studentId)])
      .then(([s, r]) => {
        setStudent(s);
        setRecords(r);
        setSelectedYearId((prev) => prev ?? r[0]?.enrollment.academicYear.id ?? null);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load attendance"));
  }, [accessToken, studentId]);

  const studentName = student ? `${student.firstName} ${student.lastName}` : "Student";

  return (
    <div>
      <PageHeader
        eyebrow="Students"
        title={`${studentName} — Attendance`}
        breadcrumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Students", href: `/schools/${schoolId}/students` },
          { label: studentName, href: `/schools/${schoolId}/students/${studentId}` },
          { label: "Attendance" },
        ]}
      />
      <div className="space-y-5 p-4 sm:p-6">
        {error ? (
          <Alert tone="danger">{error}</Alert>
        ) : !records ? (
          <SkeletonCards count={3} />
        ) : records.length === 0 ? (
          <Card>
            <EmptyState icon={ClipboardCheck} title="No attendance recorded yet" description="Nothing has been marked for this student in any academic year." />
          </Card>
        ) : (
          <YearAttendance records={records} selectedYearId={selectedYearId} onSelectYear={setSelectedYearId} />
        )}
      </div>
    </div>
  );
}

function YearAttendance({
  records,
  selectedYearId,
  onSelectYear,
}: {
  records: StudentAttendanceHistoryRecord[];
  selectedYearId: string | null;
  onSelectYear: (id: string) => void;
}) {
  const years = Array.from(new Map(records.map((r) => [r.enrollment.academicYear.id, r.enrollment.academicYear])).values());
  const yearRecords = records.filter((r) => r.enrollment.academicYear.id === selectedYearId);

  const summary = {
    present: yearRecords.filter((r) => r.status === "PRESENT").length,
    absent: yearRecords.filter((r) => r.status === "ABSENT").length,
    late: yearRecords.filter((r) => r.status === "LATE").length,
    excused: yearRecords.filter((r) => r.status === "EXCUSED").length,
    total: yearRecords.length,
  };
  const percentage = summary.total > 0 ? Math.round((summary.present / summary.total) * 1000) / 10 : null;
  const rate = percentage !== null ? rateLabel(percentage) : null;

  return (
    <>
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-foreground">Academic year</p>
            <p className="mt-0.5 text-sm text-foreground-soft">One daily record per school day, across every class/section this student has been in.</p>
          </div>
          <Select value={selectedYearId ?? ""} onChange={(e) => onSelectYear(e.target.value)} className="w-auto min-w-[180px]">
            {years.map((y) => (
              <option key={y.id} value={y.id}>
                {y.name}
              </option>
            ))}
          </Select>
        </div>
      </Card>

      {summary.total === 0 ? (
        <Card>
          <EmptyState icon={ClipboardCheck} title="No attendance recorded for this year" />
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <StatTile
              icon={Percent}
              label="Attendance Rate"
              value={percentage !== null ? `${percentage}%` : "—"}
              tone={rate?.tone ?? "accent"}
              badge={rate && <Badge tone={rate.tone}>{rate.text}</Badge>}
            />
            <StatTile icon={CalendarCheck} label="Present" value={summary.present} unit="days" tone="success" />
            <StatTile icon={CalendarX} label="Absent" value={summary.absent} unit="days" tone="danger" />
            <StatTile icon={Clock} label="Late" value={summary.late} unit="days" tone="warning" />
            <StatTile icon={ShieldCheck} label="Excused" value={summary.excused} unit="days" tone="accent" />
          </div>

          <Card>
            <CardHeader title="Attendance Overview" description="Breakdown of every recorded school day this year." />
            <div className="mt-5 flex flex-wrap items-center justify-center gap-8 sm:justify-between">
              <AttendanceDonut present={summary.present} absent={summary.absent} late={summary.late} excused={summary.excused} total={summary.total} />
            </div>
          </Card>

          <Card padding="none">
            <CardHeader title="Daily attendance" description={`${yearRecords.length} day(s) recorded this year.`} />
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-left text-sm">
                <thead className="bg-surface-soft text-xs font-semibold uppercase tracking-wide text-foreground-muted">
                  <tr>
                    <th className="px-5 py-2.5">Date</th>
                    <th className="px-5 py-2.5">Class / Section</th>
                    <th className="px-5 py-2.5">Status</th>
                    <th className="px-5 py-2.5">Note</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {yearRecords.map((r) => {
                    const d = new Date(r.date);
                    const StatusIcon = STATUS_ICON[r.status];
                    return (
                      <tr key={r.id} className="transition-colors hover:bg-surface-hover">
                        <td className="px-5 py-3 whitespace-nowrap text-foreground">
                          <span className="flex items-center gap-2">
                            <CalendarDays className="size-3.5 shrink-0 text-foreground-muted" />
                            {d.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" })}
                          </span>
                        </td>
                        <td className="px-5 py-3 whitespace-nowrap text-foreground-soft">
                          {r.enrollment.class.name} · {r.enrollment.section.name}
                        </td>
                        <td className="px-5 py-3">
                          <Badge tone={STATUS_TONE[r.status]}>
                            <StatusIcon className="size-3" />
                            {r.status}
                          </Badge>
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
      )}
    </>
  );
}
