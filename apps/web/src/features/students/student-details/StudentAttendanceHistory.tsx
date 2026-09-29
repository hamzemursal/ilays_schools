"use client";

import { useState } from "react";
import type { MyChildAttendanceRecord, StudentAttendanceHistoryRecord } from "@/lib/api";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { Select } from "@/components/ui/FormControls";
import { StudentMonthView } from "@/features/attendance/AttendanceUI";
import { groupAttendanceByDate } from "@/lib/attendance";
import { StatTile, rateLabel } from "@/features/student-portal/StatTile";
import { CalendarCheck, CalendarX, ClipboardCheck, Clock, Percent, ShieldCheck } from "lucide-react";

// Extracted, unchanged, from the standalone per-student attendance page
// (app/(app)/schools/[id]/students/[studentId]/attendance/page.tsx) so the
// Student Profile's Attendance tab shows exactly the same real, already-
// tested calculation — never a second, drifting copy of the summary math.

// Each record is one session (Morning or Afternoon) of one day; the
// calendar and monthly history show the two sessions side by side.
function toSessionRecord(r: StudentAttendanceHistoryRecord): MyChildAttendanceRecord {
  return {
    id: r.id,
    date: r.date,
    session: r.session ?? "MORNING",
    status: r.status,
    note: r.note,
    className: r.enrollment.class.name,
    sectionName: r.enrollment.section.name,
  };
}

export function StudentAttendanceHistory({ records }: { records: StudentAttendanceHistoryRecord[] }) {
  const years = Array.from(new Map(records.map((r) => [r.enrollment.academicYear.id, r.enrollment.academicYear])).values());
  const [selectedYearId, setSelectedYearId] = useState<string | null>(years[0]?.id ?? null);

  if (records.length === 0) {
    return (
      <Card>
        <EmptyState icon={ClipboardCheck} title="No attendance recorded yet" description="Nothing has been marked for this student in any academic year." />
      </Card>
    );
  }

  return (
    <YearAttendance records={records} years={years} selectedYearId={selectedYearId} onSelectYear={setSelectedYearId} />
  );
}

function YearAttendance({
  records,
  years,
  selectedYearId,
  onSelectYear,
}: {
  records: StudentAttendanceHistoryRecord[];
  years: { id: string; name: string }[];
  selectedYearId: string | null;
  onSelectYear: (id: string) => void;
}) {
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
      <Card className="rounded-2xl">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-foreground">Academic year</p>
            <p className="mt-0.5 text-sm text-foreground-soft">Morning and Afternoon sessions, across every class/section this student has been in.</p>
          </div>
          <Select value={selectedYearId ?? ""} onChange={(e) => onSelectYear(e.target.value)} aria-label="Academic year" className="w-full sm:w-auto sm:min-w-[180px]">
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
            <StatTile icon={CalendarCheck} label="Present" value={summary.present} unit="sessions" tone="success" />
            <StatTile icon={CalendarX} label="Absent" value={summary.absent} unit="sessions" tone="danger" />
            <StatTile icon={Clock} label="Late" value={summary.late} unit="sessions" tone="warning" />
            <StatTile icon={ShieldCheck} label="Excused" value={summary.excused} unit="sessions" tone="accent" />
          </div>

          <StudentMonthView days={groupAttendanceByDate(yearRecords.map(toSessionRecord))} />
        </>
      )}
    </>
  );
}

// Current-year attendance rate only — used by the Profile Overview's compact
// summary tile. Same PRESENT/total rule as above; null when nothing is
// recorded yet for that year (never a fabricated 0%).
export function currentYearAttendanceRate(records: StudentAttendanceHistoryRecord[], currentAcademicYearId: string | null): number | null {
  if (!currentAcademicYearId) return null;
  const yearRecords = records.filter((r) => r.enrollment.academicYear.id === currentAcademicYearId);
  if (yearRecords.length === 0) return null;
  const present = yearRecords.filter((r) => r.status === "PRESENT").length;
  return Math.round((present / yearRecords.length) * 1000) / 10;
}
