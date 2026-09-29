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
import { StatTile } from "@/features/parent-portal/ParentUI";
import { SO_ATTENDANCE, soDate, soStatus } from "@/features/parent-portal/so";
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
  if (!session) return <span className="text-sm text-foreground-muted">Lama qorin</span>;
  return <Badge tone={STATUS_TONE[session.status]}>{soStatus(SO_ATTENDANCE, session.status)}</Badge>;
}

export default function ParentAttendancePage() {
  const { accessToken } = useAuth();
  const { selectedChild, loading: childrenLoading, children } = useSelectedChild();

  return (
    <div>
      <PageHeader
        variant="plain"
        eyebrow="Portal-ka Waalidka"
        title="Xaadiriska"
        description={
          selectedChild
            ? `Xaadiriska maalinlaha ah ee ${selectedChild.firstName}, sannad-dugsiyeed kasta.`
            : "Xaadiriska maalinlaha ah, sannad-dugsiyeed kasta."
        }
      />

      <div className="space-y-5 px-3 pb-8 pt-4 sm:px-5">
        {childrenLoading ? (
          <SkeletonCards count={3} />
        ) : children.length === 0 ? (
          <EmptyState icon={Users} title="Weli ilmo laguma xirin akoonkaaga" />
        ) : !selectedChild || !accessToken ? (
          <EmptyState icon={Users} title="Kor ka dooro ilmo" />
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
      .catch((err) => setError(err instanceof ApiError ? err.message : "Lama soo rarin sannadaha dugsiga"));
  }, [accessToken, studentId]);

  if (error) return <Alert tone="danger">{error}</Alert>;
  if (!years) return <SkeletonCards count={3} />;
  if (years.length === 0) {
    return (
      <EmptyState
        icon={CalendarDays}
        title="Ma jiro sannad-dugsiyeed la diiwaangeliyay"
        description="Ardaygan weli ma laha taariikh diiwaangelin."
      />
    );
  }

  return (
    <>
      <Card className="rounded-2xl">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-foreground">Sannad-dugsiyeedka</p>
            <p className="mt-0.5 text-sm text-foreground-soft">Dooro sannad si aad u aragto xaadiriskiisa.</p>
          </div>
          <Select
            value={selectedYearId ?? ""}
            onChange={(e) => setSelectedYearId(e.target.value)}
            aria-label="Sannad-dugsiyeedka"
            className="w-auto min-w-[180px]"
          >
            {years.map((y) => (
              <option key={y.id} value={y.id}>
                {y.name}
                {y.isCurrent ? " (Hadda)" : ""}
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
      .catch((err) => setError(err instanceof ApiError ? err.message : "Lama soo rarin xaadiriska"));
  }, [accessToken, studentId, academicYearId]);

  if (error) return <Alert tone="danger">{error}</Alert>;
  if (!attendance || !subjects) return <SkeletonCards count={3} />;

  const { summary, records } = attendance;

  if (summary.total === 0) {
    return (
      <Card className="rounded-2xl">
        <EmptyState
          icon={ClipboardCheck}
          title="Sannadkan xaadiris lama diiwaangelin"
          description="Weli wax xaadiris ah looma qorin sannad-dugsiyeedkan."
        />
      </Card>
    );
  }

  const days = groupAttendanceByDate(records);

  return (
    <>
      <Alert tone="info">
        Maalin kasta waxaa jira laba xaadiris oo kala duwan: Subax iyo Galab. Maaddo-maaddo looma kala qaybiyo.
        &quot;Lama qorin&quot; waxay ka dhigan tahay in xaadiriska xilligaas aan la qaadin — marna looma xisaabo
        Maqnaa, boqolleyda-na waxaa laga xisaabiyaa oo keliya xilliyada la qoray.
      </Alert>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <StatTile
          icon={Percent}
          tone={summary.percentage !== null && summary.percentage < 80 ? "bg-warning-soft text-warning" : "bg-success-soft text-success"}
          label="Heerka joogitaanka"
          value={summary.percentage !== null ? `${summary.percentage}%` : "—"}
        />
        <StatTile icon={CalendarCheck} tone="bg-success-soft text-success" label="Joogay" value={summary.present} />
        <StatTile icon={CalendarX} tone="bg-danger-soft text-danger" label="Maqnaa" value={summary.absent} />
        <StatTile icon={Clock} tone="bg-warning-soft text-warning" label="Daahay" value={summary.late} />
        <StatTile icon={ShieldCheck} tone="bg-violet-50 text-violet-600" label="Fasax" value={summary.excused} />
        <StatTile icon={CalendarDays} tone="bg-accent-soft text-accent" label="Xilliyada" value={summary.total} />
      </div>

      <Card padding="none" className="rounded-2xl">
        <CardHeader title="Maaddooyinka & macallimiinta" description="Maaddooyinka sannadkan iyo macallinka mid kasta." />
        <div className="p-5">
          {subjects.length === 0 ? (
            <EmptyState icon={BookUser} title="Sannadkan maaddo lama diiwaangelin" />
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {subjects.map((s) => (
                <div key={s.subjectId} className="rounded-xl border border-border p-3.5">
                  <p className="font-medium text-foreground">{s.name}</p>
                  <p className="mt-1 flex items-center gap-1.5 text-sm text-foreground-soft">
                    <BookUser className="size-3.5 shrink-0 text-foreground-muted" />
                    {s.teacher ? `${s.teacher.firstName} ${s.teacher.lastName}` : "Weli macallin looma qoondeyn"}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </Card>

      <Card padding="none" className="rounded-2xl">
        <CardHeader title="Xaadiriska maalinlaha" description={`${days.length} maalmood ayaa la diiwaangeliyay sannadkan.`} />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="bg-surface-soft text-xs font-semibold uppercase tracking-wide text-foreground-muted">
              <tr>
                <th className="px-5 py-2.5">Taariikhda</th>
                <th className="px-5 py-2.5">Maalinta</th>
                <th className="px-5 py-2.5">Fasalka</th>
                <th className="px-5 py-2.5">Subax</th>
                <th className="px-5 py-2.5">Galab</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {days.map((day) => {
                const d = new Date(day.date);
                return (
                  <tr key={day.date}>
                    <td className="px-5 py-3 whitespace-nowrap text-foreground">
                      {soDate(d, { day: "2-digit", month: "short", year: "numeric" })}
                    </td>
                    <td className="px-5 py-3 whitespace-nowrap text-foreground-soft">
                      {soDate(d, { weekday: "long" })}
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
