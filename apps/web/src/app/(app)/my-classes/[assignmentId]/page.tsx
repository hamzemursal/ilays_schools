"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useAuth, ApiError } from "@/lib/auth-context";
import {
  api,
  type AttendanceHistoryRow,
  type AttendanceSummaryRow,
  type Exam,
  type MyAssignmentStudents,
} from "@/lib/api";
import { GuardianCard } from "@/features/guardians/components/GuardianCard";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Avatar } from "@/components/ui/Avatar";
import { Alert } from "@/components/ui/Alert";
import { EmptyState } from "@/components/ui/EmptyState";
import { SkeletonCards, SkeletonTable } from "@/components/ui/Skeleton";
import { CalendarClock, ClipboardCheck, GraduationCap, PenLine, Users } from "lucide-react";

export default function MyAssignmentPage({ params }: { params: Promise<{ assignmentId: string }> }) {
  const { assignmentId } = use(params);
  const { accessToken, user } = useAuth();

  const [data, setData] = useState<MyAssignmentStudents | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [exams, setExams] = useState<Exam[] | null>(null);
  const [summary, setSummary] = useState<AttendanceSummaryRow[] | null>(null);
  const [history, setHistory] = useState<AttendanceHistoryRow[] | null>(null);
  const [expandedStudent, setExpandedStudent] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken) return;
    api
      .myAssignmentStudents(accessToken, assignmentId)
      .then((res) => {
        setData(res);
        const schoolId = res.assignment.schoolId;
        const sectionId = res.assignment.section.id;
        api.listExams(accessToken, schoolId).then(setExams).catch(() => setExams([]));
        api.getAttendanceSummary(accessToken, schoolId, sectionId).then(setSummary).catch(() => setSummary([]));
        api.getAttendanceHistory(accessToken, schoolId, sectionId).then(setHistory).catch(() => setHistory([]));
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load this class"));
  }, [accessToken, assignmentId]);

  const canMarkAttendance = user?.permissions.includes("attendance.mark") ?? false;
  const canEnterMarks = user?.permissions.includes("results.enter") ?? false;

  if (error) {
    return (
      <div className="p-4 sm:p-6">
        <Alert tone="danger">{error}</Alert>
      </div>
    );
  }
  if (!data) return <SkeletonCards count={3} />;

  const { assignment, students } = data;
  const today = new Date().toISOString().slice(0, 10);
  const matchingExamSubjects = (exams ?? []).flatMap((exam) =>
    exam.examSubjects
      .filter((es) => es.classId === assignment.section.class.id && es.subjectId === assignment.subject.id)
      .map((es) => ({ examName: exam.name, examSubjectId: es.id })),
  );

  return (
    <div>
      <PageHeader
        eyebrow="Teaching"
        title={`${assignment.section.class.name} · ${assignment.section.name} — ${assignment.subject.name}`}
        description={assignment.academicYear.name}
        breadcrumbs={[{ label: "My classes", href: "/my-classes" }, { label: assignment.subject.name }]}
      />

      <div className="space-y-5 p-4 sm:p-6">
        <Card padding="none">
          <CardHeader
            title="Students"
            description={`${students.length} active student(s) in this section.`}
            actions={
              canMarkAttendance && (
                <Link href={`/schools/${assignment.schoolId}/sections/${assignment.section.id}/attendance?date=${today}`}>
                  <Button size="sm" icon={<ClipboardCheck className="size-4" />}>
                    Mark attendance
                  </Button>
                </Link>
              )
            }
          />
          {students.length === 0 ? (
            <div className="p-5">
              <EmptyState icon={Users} title="No active students" description="This section has no active students yet." />
            </div>
          ) : (
            <div className="divide-y divide-border">
              {students.map((s) => (
                <div key={s.enrollmentId} className="p-4 sm:p-5">
                  <div className="flex flex-wrap items-center gap-3">
                    <Avatar name={`${s.firstName} ${s.lastName}`} photoUrl={s.photoUrl} />
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-foreground">
                        <span className="text-foreground-muted">#{s.rollNumber}</span> {s.firstName} {s.lastName}
                      </p>
                      <p className="font-mono text-xs text-foreground-muted">{s.studentNumber}</p>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      <Badge tone="success">{s.attendanceSummary.present} present</Badge>
                      <Badge tone="danger">{s.attendanceSummary.absent} absent</Badge>
                      <Badge tone="warning">{s.attendanceSummary.late} late</Badge>
                      <Badge tone="accent">{s.attendanceSummary.excused} excused</Badge>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setExpandedStudent((prev) => (prev === s.enrollmentId ? null : s.enrollmentId))}
                    >
                      {expandedStudent === s.enrollmentId ? "Hide guardian" : "Guardian info"}
                    </Button>
                  </div>
                  {expandedStudent === s.enrollmentId && (
                    <div className="mt-3 space-y-2 pl-0 sm:pl-14">
                      {s.guardians.length === 0 ? (
                        <p className="text-sm text-foreground-muted">No guardians on file.</p>
                      ) : (
                        s.guardians.map((g) => <GuardianCard key={g.id} guardian={g} />)
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card padding="none">
          <CardHeader title="Attendance summary" description="All-time counts for this section." />
          {!summary ? (
            <div className="p-5">
              <SkeletonTable rows={4} cols={5} />
            </div>
          ) : summary.length === 0 ? (
            <div className="p-5">
              <EmptyState icon={ClipboardCheck} title="No attendance recorded yet" description="Mark attendance to see a summary here." />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-left text-sm">
                <thead className="bg-surface-soft text-xs font-semibold uppercase tracking-wide text-foreground-muted">
                  <tr>
                    <th className="px-5 py-2.5">Student</th>
                    <th className="px-5 py-2.5">Present</th>
                    <th className="px-5 py-2.5">Absent</th>
                    <th className="px-5 py-2.5">Late</th>
                    <th className="px-5 py-2.5">Excused</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {summary.map((row) => (
                    <tr key={row.enrollmentId}>
                      <td className="px-5 py-3 text-foreground">
                        <span className="text-foreground-muted">#{row.rollNumber}</span> {row.firstName} {row.lastName}
                      </td>
                      <td className="px-5 py-3 text-foreground-soft">{row.present}</td>
                      <td className="px-5 py-3 text-foreground-soft">{row.absent}</td>
                      <td className="px-5 py-3 text-foreground-soft">{row.late}</td>
                      <td className="px-5 py-3 text-foreground-soft">{row.excused}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card padding="none">
          <CardHeader title="Attendance history" description="Most recent entries first." />
          {!history ? (
            <div className="p-5">
              <SkeletonTable rows={4} cols={3} />
            </div>
          ) : history.length === 0 ? (
            <div className="p-5">
              <EmptyState icon={ClipboardCheck} title="No history yet" description="Marked attendance will appear here." />
            </div>
          ) : (
            <div className="max-h-80 overflow-y-auto">
              <table className="w-full min-w-[480px] text-left text-sm">
                <thead className="sticky top-0 bg-surface-soft text-xs font-semibold uppercase tracking-wide text-foreground-muted">
                  <tr>
                    <th className="px-5 py-2.5">Date</th>
                    <th className="px-5 py-2.5">Student</th>
                    <th className="px-5 py-2.5">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {history.slice(0, 100).map((row) => (
                    <tr key={row.id}>
                      <td className="px-5 py-3 text-foreground-soft">{new Date(row.date).toLocaleDateString()}</td>
                      <td className="px-5 py-3 text-foreground">
                        #{row.enrollment.rollNumber} {row.enrollment.student.firstName} {row.enrollment.student.lastName}
                      </td>
                      <td className="px-5 py-3">
                        <Badge
                          tone={
                            row.status === "PRESENT" ? "success" : row.status === "ABSENT" ? "danger" : row.status === "LATE" ? "warning" : "accent"
                          }
                        >
                          {row.status}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card padding="none">
          <CardHeader title="Marks" description="Exams that include this class and subject." />
          <div className="p-5">
            {!exams ? (
              <p className="text-sm text-foreground-muted">Loading…</p>
            ) : matchingExamSubjects.length === 0 ? (
              <EmptyState icon={PenLine} title="No exams yet" description="Your School Admin hasn't scheduled an exam for this class/subject." />
            ) : (
              <div className="flex flex-wrap gap-2">
                {matchingExamSubjects.map((m) => (
                  <Link key={m.examSubjectId} href={`/schools/${assignment.schoolId}/exam-subjects/${m.examSubjectId}/sections/${assignment.section.id}/results`}>
                    <Button size="sm" variant="outline" icon={<PenLine className="size-4" />}>
                      {canEnterMarks ? "Enter marks" : "View marks"} — {m.examName}
                    </Button>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </Card>

        <Card padding="none">
          <CardHeader title="Timetable" description="Recurring schedule for this class." />
          <div className="p-5">
            <div className="flex flex-wrap gap-2">
              <Badge tone="accent">
                <GraduationCap className="size-3.5" /> {assignment.section.class.name} · {assignment.section.name}
              </Badge>
              <Badge tone="accent">{assignment.subject.name}</Badge>
              <Badge tone="neutral">{assignment.academicYear.name}</Badge>
            </div>
            <p className="mt-3 flex items-start gap-1.5 text-sm text-foreground-muted">
              <CalendarClock className="mt-0.5 size-3.5 shrink-0" />
              Day/time/room scheduling isn&apos;t tracked by this system yet — this is the recurring class/subject
              assignment on record.
            </p>
          </div>
        </Card>
      </div>
    </div>
  );
}
