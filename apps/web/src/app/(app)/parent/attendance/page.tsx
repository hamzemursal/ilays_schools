"use client";

import { useEffect, useState } from "react";
import { useAuth, ApiError } from "@/lib/auth-context";
import { api, type MyChildAcademicYear, type MyChildAttendance, type MyChildSubject } from "@/lib/api";
import { groupAttendanceByDate } from "@/lib/attendance";
import { useSelectedChild } from "@/features/parent-portal/SelectedChildContext";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Alert } from "@/components/ui/Alert";
import { EmptyState } from "@/components/ui/EmptyState";
import { SkeletonCards } from "@/components/ui/Skeleton";
import { StatCard } from "@/components/ui/StatCard";
import { Select } from "@/components/ui/FormControls";
import {
  BookUser,
  CalendarCheck,
  CalendarDays,
  CalendarX,
  ClipboardCheck,
  Clock,
  Percent,
  ShieldCheck,
  Users,
} from "lucide-react";

const STATUS_TONE: Record<string, "success" | "danger" | "warning" | "neutral"> = {
  PRESENT: "success",
  ABSENT: "danger",
  LATE: "warning",
  EXCUSED: "neutral",
};

// One cell of the Morning/Afternoon columns below — a session with no
// record renders as a plain "Not Recorded" dash, never as if it were marked
// Absent. That distinction is the whole reason these two are separate
// columns instead of one combined daily value.
function SessionCell({ session }: { session?: { status: string } }) {
  if (!session) return <span className="text-sm text-foreground-muted">Not Recorded</span>;
  return <Badge tone={STATUS_TONE[session.status]}>{session.status}</Badge>;
}

export default function ParentAttendancePage() {
  const { accessToken } = useAuth();
  const { selectedChild, loading: childrenLoading, children } = useSelectedChild();

  return (
    <div>
      <PageHeader eyebrow="Parent Portal" title="Attendance" description="Daily attendance record, by academic year." />

      <div className="space-y-5 p-4 sm:p-6">
        {childrenLoading ? (
          <SkeletonCards count={3} />
        ) : children.length === 0 ? (
          <EmptyState icon={Users} title="No children linked yet" />
        ) : !selectedChild || !accessToken ? (
          <EmptyState icon={Users} title="Select a child above" />
        ) : (
          <YearPicker key={selectedChild.studentId} accessToken={accessToken} studentId={selectedChild.studentId} />
        )}
      </div>
    </div>
  );
}

// Loads the list of academic years this student has ever been enrolled in,
// then hands the chosen one down — attendance and subjects are always
// fetched together, scoped to the same year, so the two sections on the
// page can never show data from two different years at once.
function YearPicker({ accessToken, studentId }: { accessToken: string; studentId: string }) {
  const [years, setYears] = useState<MyChildAcademicYear[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedYearId, setSelectedYearId] = useState<string | null>(null);

  useEffect(() => {
    api
      .getMyChildAcademicYears(accessToken, studentId)
      .then((list) => {
        setYears(list);
        setSelectedYearId(list.find((y) => y.isCurrent)?.id ?? list[0]?.id ?? null);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load academic years"));
  }, [accessToken, studentId]);

  if (error) return <Alert tone="danger">{error}</Alert>;
  if (!years) return <SkeletonCards count={3} />;
  if (years.length === 0) {
    return (
      <EmptyState
        icon={CalendarDays}
        title="No academic year on record"
        description="This student doesn't have any enrollment history yet."
      />
    );
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
        <YearAttendance
          key={selectedYearId}
          accessToken={accessToken}
          studentId={studentId}
          academicYearId={selectedYearId}
        />
      )}
    </>
  );
}

function YearAttendance({
  accessToken,
  studentId,
  academicYearId,
}: {
  accessToken: string;
  studentId: string;
  academicYearId: string;
}) {
  const [attendance, setAttendance] = useState<MyChildAttendance | null>(null);
  const [subjects, setSubjects] = useState<MyChildSubject[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      api.getMyChildAttendance(accessToken, studentId, academicYearId),
      api.getMyChildSubjects(accessToken, studentId, academicYearId),
    ])
      .then(([att, subs]) => {
        setAttendance(att);
        setSubjects(subs);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load attendance"));
  }, [accessToken, studentId, academicYearId]);

  if (error) return <Alert tone="danger">{error}</Alert>;
  if (!attendance || !subjects) return <SkeletonCards count={3} />;

  const { summary, records } = attendance;

  if (summary.total === 0) {
    return (
      <Card>
        <EmptyState
          icon={ClipboardCheck}
          title="No attendance records found for this year"
          description="Nothing has been marked for this academic year yet."
        />
      </Card>
    );
  }

  const days = groupAttendanceByDate(records);

  return (
    <>
      <Alert tone="info">
        This shows both of the school day&apos;s attendance sessions — Morning and Afternoon — separately. It is not
        broken down by subject. &quot;Not Recorded&quot; means attendance was not taken for that session; it is never
        counted as Absent, and the rate is calculated only from sessions that were recorded.
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
        <StatCard icon={CalendarDays} label="Sessions" value={summary.total} tone="neutral" />
      </div>

      <Card padding="none">
        <CardHeader title="Subjects & teachers" description="This year's subjects and their assigned teacher." />
        <div className="p-5">
          {subjects.length === 0 ? (
            <EmptyState icon={BookUser} title="No subjects on record for this year" />
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {subjects.map((s) => (
                <div key={s.subjectId} className="rounded-lg border border-border p-3.5">
                  <p className="font-medium text-foreground">{s.name}</p>
                  <p className="mt-1 flex items-center gap-1.5 text-sm text-foreground-soft">
                    <BookUser className="size-3.5 shrink-0 text-foreground-muted" />
                    {s.teacher ? `${s.teacher.firstName} ${s.teacher.lastName}` : "No teacher assigned yet"}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </Card>

      <Card padding="none">
        <CardHeader title="Daily attendance" description={`${days.length} day(s) recorded this year.`} />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="bg-surface-soft text-xs font-semibold uppercase tracking-wide text-foreground-muted">
              <tr>
                <th className="px-5 py-2.5">Date</th>
                <th className="px-5 py-2.5">Day</th>
                <th className="px-5 py-2.5">Class / Section</th>
                <th className="px-5 py-2.5">Morning Session</th>
                <th className="px-5 py-2.5">Afternoon Session</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {days.map((day) => {
                const d = new Date(day.date);
                return (
                  <tr key={day.date}>
                    <td className="px-5 py-3 whitespace-nowrap text-foreground">
                      {d.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" })}
                    </td>
                    <td className="px-5 py-3 whitespace-nowrap text-foreground-soft">
                      {d.toLocaleDateString(undefined, { weekday: "long" })}
                    </td>
                    <td className="px-5 py-3 whitespace-nowrap text-foreground-soft">
                      {day.className} · {day.sectionName}
                    </td>
                    <td className="px-5 py-3">
                      <SessionCell session={day.sessions.MORNING} />
                    </td>
                    <td className="px-5 py-3">
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
