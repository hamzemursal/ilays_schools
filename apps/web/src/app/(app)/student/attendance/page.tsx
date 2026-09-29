"use client";

import { useEffect, useState } from "react";
import type { LucideIcon } from "lucide-react";
import { useAuth, ApiError } from "@/lib/auth-context";
import { api, type MyChildAcademicYear, type MyChildAttendance } from "@/lib/api";
import { groupAttendanceByDate } from "@/lib/attendance";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Alert } from "@/components/ui/Alert";
import { EmptyState } from "@/components/ui/EmptyState";
import { SkeletonCards } from "@/components/ui/Skeleton";
import { Select } from "@/components/ui/FormControls";
import { StudentMonthView } from "@/features/attendance/AttendanceUI";
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

// A session with no record renders as a plain "Not Recorded" dash, never as
// if it were marked Absent — that distinction is the whole reason Morning
// and Afternoon are separate columns instead of one combined daily value.
// Keeps the "marked by" detail (previously its own column) as a caption
// under each session's own badge, since each session can have its own marker.
function SessionCell({ session }: { session?: { status: string; markedByName?: string | null } }) {
  if (!session) return <span className="text-sm text-foreground-muted">Not Recorded</span>;
  const StatusIcon = STATUS_ICON[session.status];
  return (
    <div>
      <Badge tone={STATUS_TONE[session.status]}>
        <StatusIcon className="size-3" />
        {session.status}
      </Badge>
      {session.markedByName && <p className="mt-1 text-xs text-foreground-muted">by {session.markedByName}</p>}
    </div>
  );
}

export default function StudentAttendancePage() {
  const { accessToken } = useAuth();

  return (
    <div>
      <PageHeader
        variant="plain"
        eyebrow="Student Portal"
        title="Attendance"
        description="Your own attendance — Morning and Afternoon sessions, by academic year. Read-only."
      />

      <div className="space-y-5 px-3 pb-8 pt-4 sm:px-5">
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
            aria-label="Academic year"
            className="w-full sm:w-auto sm:min-w-[180px]"
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

  const rate = summary.percentage !== null ? rateLabel(summary.percentage) : null;

  const days = groupAttendanceByDate(records);

  return (
    <>
      <Alert tone="info">
        This shows both of the school day&apos;s attendance sessions — Morning and Afternoon — separately. It is not
        broken down by subject. &quot;Not Recorded&quot; means attendance was not taken for that session; it is never
        counted as Absent, and the rate is calculated only from sessions that were recorded.
      </Alert>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <StatTile
          icon={Percent}
          label="Attendance Rate"
          value={summary.percentage !== null ? `${summary.percentage}%` : "—"}
          tone={rate?.tone ?? "accent"}
          badge={rate && <Badge tone={rate.tone}>{rate.text}</Badge>}
        />
        <StatTile icon={CalendarCheck} label="Present" value={summary.present} unit="sessions" tone="success" />
        <StatTile icon={CalendarX} label="Absent" value={summary.absent} unit="sessions" tone="danger" />
        <StatTile icon={Clock} label="Late" value={summary.late} unit="sessions" tone="warning" />
        <StatTile icon={ShieldCheck} label="Excused" value={summary.excused} unit="sessions" tone="accent" />
      </div>

      <StudentMonthView days={days} showHistory={false} />

      <Card padding="none" className="rounded-2xl">
        <CardHeader title="Daily attendance" description={`${days.length} day(s) recorded this year.`} />
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm sm:min-w-[680px]">
            <thead className="bg-surface-soft text-xs font-semibold uppercase tracking-wide text-foreground-muted max-sm:hidden">
              <tr>
                <th className="px-5 py-2.5">Date</th>
                <th className="px-5 py-2.5">Day</th>
                <th className="px-5 py-2.5">Class / Section</th>
                <th className="px-5 py-2.5">Morning Session</th>
                <th className="px-5 py-2.5">Afternoon Session</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border max-sm:block max-sm:space-y-2 max-sm:divide-y-0 max-sm:p-3">
              {days.map((day) => {
                const d = new Date(day.date);
                return (
                  <tr key={day.date} className="transition-colors hover:bg-surface-hover max-sm:block max-sm:rounded-xl max-sm:border max-sm:border-border max-sm:p-3">
                    <td className="px-5 py-3 whitespace-nowrap font-medium text-foreground max-sm:block max-sm:p-0">
                      <span className="flex items-center gap-2">
                        <CalendarDays className="size-3.5 shrink-0 text-foreground-muted" />
                        {d.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" })}
                      </span>
                    </td>
                    <td className="px-5 py-3 whitespace-nowrap text-foreground-soft max-sm:hidden">
                      {d.toLocaleDateString(undefined, { weekday: "long" })}
                    </td>
                    <td className="px-5 py-3 whitespace-nowrap text-foreground-soft max-sm:block max-sm:p-0 max-sm:pb-2 max-sm:text-xs">
                      {day.className} · {day.sectionName}
                    </td>
                    <td className="px-5 py-3 max-sm:flex max-sm:items-center max-sm:justify-between max-sm:px-0 max-sm:py-1">
                      <span className="text-xs text-foreground-muted sm:hidden">Morning</span>
                      <SessionCell session={day.sessions.MORNING} />
                    </td>
                    <td className="px-5 py-3 max-sm:flex max-sm:items-center max-sm:justify-between max-sm:px-0 max-sm:py-1">
                      <span className="text-xs text-foreground-muted sm:hidden">Afternoon</span>
                      <SessionCell session={day.sessions.AFTERNOON} />
                    </td>
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
