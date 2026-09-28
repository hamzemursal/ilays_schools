"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Award, BookOpen, CalendarDays, ClipboardList, GraduationCap, Hash, Layers, Lock, School as SchoolIcon, User } from "lucide-react";
import { ApiError, useAuth } from "@/lib/auth-context";
import { api, type MyResultsReport, type PortalResultRow, type StudentAttendanceHistoryRecord, type StudentDetail, type StudentEnrollmentRecord } from "@/lib/api";
import { studentsApi } from "@/features/students/api";
import { Card, CardHeader } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { Alert } from "@/components/ui/Alert";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { SkeletonCards } from "@/components/ui/Skeleton";
import { Select } from "@/components/ui/FormControls";
import { TabBar } from "@/components/ui/TabBar";
import { AcademicHistoryTimeline } from "@/features/students/student-details/AcademicHistoryTimeline";
import { TransferHistoryList } from "@/features/students/student-details/TransferHistoryList";
import { StudentAttendanceHistory } from "@/features/students/student-details/StudentAttendanceHistory";
import { StudentYearReportView } from "@/features/student-portal/StudentResultsView";

// A READ-ONLY former-student profile (official Alumni = Form 4 graduates;
// Primary Completers = Class 8 completers who did not continue — never
// presented as alumni). It reads the student's existing record and
// history (StudentsService.getFullDetail, the results report, attendance) —
// the same endpoints the Student Profile uses — and renders them without any
// Edit, Delete, transfer, guardian or password action.

// "Finish" is labelled Graduation for a Form 4 graduate, Completion for a
// Class 8 completer.
const TABS = ["Overview", "Finish", "Academic History", "Results", "Exams", "Attendance", "Enrollment", "Transfers"] as const;
type Tab = (typeof TABS)[number];

export type FormerStudentKind = "ALUMNI" | "PRIMARY_COMPLETER" | "FORMER_STUDENT";

// One vocabulary for every visible label of the profile.
export const KIND_TERMS: Record<FormerStudentKind, { title: string; section: string; finishTab: string; badge: string | null }> = {
  ALUMNI: { title: "Alumni Profile", section: "Alumni", finishTab: "Graduation", badge: "Graduated — Form 4" },
  PRIMARY_COMPLETER: { title: "Primary Completer Profile", section: "Primary Completers", finishTab: "Completion", badge: "Completed — Class 8" },
  FORMER_STUDENT: { title: "Former Student Profile", section: "Former Students", finishTab: "Completion", badge: null },
};

export function formerStudentKind(enrollments: StudentEnrollmentRecord[]): FormerStudentKind {
  const finish = finishingEnrollment(enrollments);
  if (finish?.status === "GRADUATED") return "ALUMNI";
  if (finish?.status === "COMPLETED") return "PRIMARY_COMPLETER";
  return "FORMER_STUDENT";
}

function formatDate(value: string | null) {
  return value ? new Date(value).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : "—";
}

// The enrollment the student finished on: a GRADUATED one first (Form 4),
// otherwise a COMPLETED one (Class 8, not continued).
export function finishingEnrollment(enrollments: StudentEnrollmentRecord[]): StudentEnrollmentRecord | null {
  return enrollments.find((e) => e.status === "GRADUATED") ?? enrollments.find((e) => e.status === "COMPLETED") ?? null;
}

// Page frame: the title, eyebrow and breadcrumb follow the person's kind, so a
// Class 8 completer is never titled as an alumnus. Neutral while loading.
export function AlumniProfile({ schoolId, studentId }: { schoolId: string; studentId: string }) {
  const [kind, setKind] = useState<FormerStudentKind | null>(null);
  const terms = kind ? KIND_TERMS[kind] : null;
  return (
    <div>
      <PageHeader
        eyebrow={terms?.section ?? "Former Students"}
        title={terms?.title ?? "Profile"}
        breadcrumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: terms?.section ?? "Former Students", href: `/schools/${schoolId}/alumni` },
          { label: "Profile" },
        ]}
      />
      <div className="mx-auto max-w-5xl p-4 sm:p-6">
        <AlumniProfileBody schoolId={schoolId} studentId={studentId} onKind={setKind} />
      </div>
    </div>
  );
}

function AlumniProfileBody({
  schoolId,
  studentId,
  onKind,
}: {
  schoolId: string;
  studentId: string;
  onKind: (kind: FormerStudentKind) => void;
}) {
  const { accessToken, user } = useAuth();
  const [student, setStudent] = useState<StudentDetail | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("Overview");
  const [attendance, setAttendance] = useState<StudentAttendanceHistoryRecord[] | null>(null);
  const [reportYearId, setReportYearId] = useState("");
  // Keyed by the year it was loaded for (no state reset inside the effect).
  const [loadedReport, setLoadedReport] = useState<{ yearId: string; report: MyResultsReport | null; error: string | null } | null>(null);
  const report = loadedReport?.yearId === reportYearId ? loadedReport.report : null;
  const reportError = loadedReport?.yearId === reportYearId ? loadedReport.error : null;

  const canViewResults = user?.permissions.includes("results.view") ?? false;
  const canViewAttendance = user?.permissions.includes("attendance.view") ?? false;
  const canUndoOutcome = user?.permissions.includes("promotions.execute") ?? false;

  useEffect(() => {
    if (!accessToken) return;
    studentsApi
      .getOne(accessToken, studentId)
      .then((s) => {
        setStudent(s);
        onKind(formerStudentKind(s.enrollments));
        setReportYearId(finishingEnrollment(s.enrollments)?.academicYear.id ?? s.enrollments[0]?.academicYear.id ?? "");
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load this profile"));
    studentsApi
      .getPhotoUrl(accessToken, studentId)
      .then((r) => setPhotoUrl(r.url))
      .catch(() => setPhotoUrl(null));
  }, [accessToken, studentId, onKind]);

  useEffect(() => {
    if (!accessToken || !canViewAttendance) return;
    api
      .getStudentAttendanceHistory(accessToken, studentId)
      .then(setAttendance)
      .catch(() => setAttendance([]));
  }, [accessToken, studentId, canViewAttendance]);

  useEffect(() => {
    if (!accessToken || !reportYearId || !canViewResults) return;
    let cancelled = false;
    studentsApi
      .getResultsReport(accessToken, studentId, reportYearId)
      .then((r) => {
        if (!cancelled) setLoadedReport({ yearId: reportYearId, report: r, error: null });
      })
      .catch((err) => {
        if (!cancelled) setLoadedReport({ yearId: reportYearId, report: null, error: err instanceof ApiError ? err.message : "Failed to load results" });
      });
    return () => {
      cancelled = true;
    };
  }, [accessToken, studentId, reportYearId, canViewResults]);

  const years = useMemo(() => {
    const seen = new Set<string>();
    return (student?.enrollments ?? []).filter((e) => (seen.has(e.academicYear.id) ? false : (seen.add(e.academicYear.id), true)));
  }, [student]);

  if (error) return <Alert tone="danger">{error}</Alert>;
  if (!student) return <SkeletonCards count={3} />;

  const finish = finishingEnrollment(student.enrollments);
  const fullName = `${student.firstName} ${student.lastName}`;
  const graduated = finish?.status === "GRADUATED";
  const terms = KIND_TERMS[formerStudentKind(student.enrollments)];
  const visibleTabs = TABS.filter((t) => (t === "Results" || t === "Exams" ? canViewResults : t === "Attendance" ? canViewAttendance : true));
  // TabBar shows its values as labels: map "Finish" to Graduation/Completion.
  const tabLabels = visibleTabs.map((t) => (t === "Finish" ? terms.finishTab : t));
  const tabFromLabel = (label: string) => (label === terms.finishTab ? "Finish" : (label as Tab));

  const yearPicker = (
    <Select value={reportYearId} onChange={(e) => setReportYearId(e.target.value)} aria-label="Academic year" className="w-48">
      {years.map((e) => (
        <option key={e.academicYear.id} value={e.academicYear.id}>
          {e.academicYear.name} · {e.class.name}
        </option>
      ))}
    </Select>
  );

  return (
    <div className="space-y-5">
      <Card>
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
          <Avatar name={fullName} photoUrl={photoUrl} size="xl" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold text-foreground">{fullName}</h1>
              {finish && (
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                    graduated ? "bg-accent text-white" : "border border-border bg-surface-soft text-foreground-soft"
                  }`}
                >
                  <GraduationCap className="size-3.5" /> {terms.badge}
                </span>
              )}
              <span className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-xs text-foreground-muted">
                <Lock className="size-3" /> Read-only
              </span>
            </div>
            <p className="mt-1 font-mono text-sm text-foreground-soft">{finish?.studentNumber ?? student.enrollments[0]?.studentNumber ?? "—"}</p>
            {finish && (
              <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
                <HeaderFact icon={SchoolIcon} label="School" value={finish.school.name} />
                <HeaderFact icon={Layers} label={graduated ? "Final form" : "Final class"} value={finish.class.name} />
                <HeaderFact icon={Hash} label="Section" value={finish.section.name} />
                <HeaderFact icon={CalendarDays} label={graduated ? "Graduation year" : "Completion year"} value={finish.academicYear.name} />
              </dl>
            )}
          </div>
        </div>
      </Card>

      {!finish && (
        <Alert tone="info">This student has no graduation or completion record — their history is shown read-only below.</Alert>
      )}

      <TabBar tabs={tabLabels} active={tab === "Finish" ? terms.finishTab : tab} onChange={(label) => setTab(tabFromLabel(label))} />

      {tab === "Overview" && (
        <div className="grid gap-5 md:grid-cols-2">
          <Card padding="none">
            <CardHeader title="Personal details" />
            <dl className="divide-y divide-border">
              <Row label="Full name" value={fullName} />
              <Row label="Date of birth" value={formatDate(student.dateOfBirth)} />
              <Row label="Sex" value={student.sex === "MALE" ? "Male" : student.sex === "FEMALE" ? "Female" : String(student.sex)} />
              <Row label="Permanent Student ID" value={finish?.studentNumber ?? "—"} mono />
              {student.legacyStudentNumber && <Row label="Legacy number" value={student.legacyStudentNumber} mono />}
            </dl>
          </Card>
          <Card padding="none">
            <CardHeader title="At a glance" />
            <dl className="divide-y divide-border">
              <Row label="Current status" value={student.currentStatus.replace(/_/g, " ")} />
              <Row label="Academic years" value={String(years.length)} />
              <Row label="Enrollments" value={String(student.enrollments.length)} />
              <Row label="Transfers" value={String(student.transfers.length)} />
              <Row label="Guardians on file" value={String(student.guardians.length)} />
            </dl>
          </Card>
        </div>
      )}

      {tab === "Finish" &&
        (finish ? (
          <Card padding="none">
            <CardHeader
              title={graduated ? "Graduation information" : "Completion information"}
              description={graduated ? "Form 4 → GRADUATED → Alumni. No next-year enrollment." : "Class 8 → COMPLETED. Did not continue to Form 1."}
            />
            <dl className="divide-y divide-border">
              <Row label="Outcome" value={graduated ? "Graduated" : "Completed — not continuing"} />
              <Row label="School" value={finish.school.name} />
              <Row label={graduated ? "Final form" : "Final class"} value={finish.class.name} />
              <Row label="Section" value={finish.section.name} />
              <Row label="Academic year" value={finish.academicYear.name} />
              <Row label="Roll number" value={`#${finish.rollNumber}`} />
              <Row label="Enrolled from" value={formatDate(finish.startDate)} />
              <Row label={graduated ? "Graduation date" : "Completion date"} value={formatDate(finish.endDate)} />
              <Row label="Student ID" value={finish.studentNumber} mono />
            </dl>
            {canUndoOutcome && finish.status === student.currentStatus && (
              <p className="border-t border-border px-5 py-3 text-xs text-foreground-muted">
                Recorded by mistake? It can be undone from the{" "}
                <Link href={`/schools/${finish.school.id}/students/${student.id}`} className="font-medium text-accent hover:underline">
                  student profile
                </Link>
                .
              </p>
            )}
          </Card>
        ) : (
          <Card>
            <EmptyState icon={Award} title="No graduation or completion record" description="This student has not graduated or completed a final class." />
          </Card>
        ))}

      {tab === "Academic History" && (
        <AcademicHistoryTimeline enrollments={student.enrollments} schoolId={schoolId} studentId={student.id} canViewResults={canViewResults} />
      )}

      {tab === "Results" && (
        <div className="space-y-4">
          <div className="flex justify-end">{yearPicker}</div>
          {reportError ? (
            <Alert tone="danger">{reportError}</Alert>
          ) : !report ? (
            <SkeletonCards count={2} />
          ) : (
            <StudentYearReportView report={report} />
          )}
        </div>
      )}

      {tab === "Exams" && (
        <div className="space-y-4">
          <div className="flex justify-end">{yearPicker}</div>
          {reportError ? <Alert tone="danger">{reportError}</Alert> : !report ? <SkeletonCards count={2} /> : <ExamsTable report={report} />}
        </div>
      )}

      {tab === "Attendance" &&
        (attendance === null ? <SkeletonCards count={3} /> : <StudentAttendanceHistory records={attendance} />)}

      {tab === "Enrollment" && <EnrollmentTable enrollments={student.enrollments} />}

      {tab === "Transfers" && <TransferHistoryList transfers={student.transfers} />}
    </div>
  );
}

function HeaderFact({ icon: Icon, label, value }: { icon: typeof User; label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="flex items-center gap-1 text-xs text-foreground-muted">
        <Icon className="size-3.5" /> {label}
      </dt>
      <dd className="truncate font-medium text-foreground">{value}</dd>
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 px-5 py-3 text-sm">
      <dt className="text-foreground-soft">{label}</dt>
      <dd className={`text-right font-medium text-foreground ${mono ? "font-mono text-xs" : ""}`}>{value}</dd>
    </div>
  );
}

// Every published exam result of the selected year, grouped by exam.
function ExamsTable({ report }: { report: MyResultsReport }) {
  const rows: (PortalResultRow & { term: string })[] = [
    ...report.terms.flatMap((t) => t.results.map((r) => ({ ...r, term: t.name }))),
    ...report.otherResults.map((r) => ({ ...r, term: "Other" })),
  ];
  if (rows.length === 0) {
    return (
      <Card>
        <EmptyState icon={ClipboardList} title="No published exams" description={`Nothing was published for ${report.academicYear.name}.`} />
      </Card>
    );
  }
  const exams = [...new Set(rows.map((r) => `${r.term}::${r.examName}`))];
  return (
    <div className="space-y-4">
      {exams.map((key) => {
        const [term, examName] = key.split("::");
        const examRows = rows.filter((r) => r.term === term && r.examName === examName);
        return (
          <Card key={key} padding="none">
            <CardHeader title={examName} description={term} actions={<Badge tone="neutral">{examRows.length} subjects</Badge>} />
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-left text-sm">
                <thead className="bg-surface-soft text-xs font-semibold uppercase tracking-wide text-foreground-muted">
                  <tr>
                    <th className="px-5 py-2.5">Subject</th>
                    <th className="px-3 py-2.5 text-right">Marks</th>
                    <th className="px-3 py-2.5 text-right">%</th>
                    <th className="px-5 py-2.5">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {examRows.map((r) => (
                    <tr key={r.id}>
                      <td className="px-5 py-2.5 text-foreground">{r.subjectName}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">
                        {r.status === "INCOMPLETE" || r.marksObtained === null ? "—" : `${r.marksObtained} / ${r.maxMarks}`}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{r.percentage === null ? "—" : `${r.percentage}%`}</td>
                      <td className="px-5 py-2.5">
                        {r.status === "INCOMPLETE" ? <Badge tone="warning">Incomplete</Badge> : <Badge tone="success">Completed</Badge>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        );
      })}
    </div>
  );
}

const ENROLLMENT_TONE: Record<StudentEnrollmentRecord["status"], "success" | "accent" | "warning" | "neutral"> = {
  ACTIVE: "success",
  PROMOTED: "accent",
  RETAINED: "warning",
  TRANSFERRED_OUT: "neutral",
  COMPLETED: "accent",
  GRADUATED: "accent",
  WITHDRAWN: "neutral",
};

function EnrollmentTable({ enrollments }: { enrollments: StudentEnrollmentRecord[] }) {
  if (enrollments.length === 0) {
    return (
      <Card>
        <EmptyState icon={BookOpen} title="No enrollments" description="This student has no recorded enrollment." />
      </Card>
    );
  }
  return (
    <Card padding="none">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="bg-surface-soft text-xs font-semibold uppercase tracking-wide text-foreground-muted">
            <tr>
              <th className="px-5 py-2.5">Academic year</th>
              <th className="px-3 py-2.5">School</th>
              <th className="px-3 py-2.5">Class</th>
              <th className="px-3 py-2.5">Section</th>
              <th className="px-3 py-2.5">Roll</th>
              <th className="px-3 py-2.5">Student ID</th>
              <th className="px-3 py-2.5">Period</th>
              <th className="px-5 py-2.5">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {enrollments.map((e) => (
              <tr key={e.id}>
                <td className="px-5 py-2.5 font-medium text-foreground">{e.academicYear.name}</td>
                <td className="px-3 py-2.5 text-foreground-soft">{e.school.name}</td>
                <td className="px-3 py-2.5 text-foreground-soft">{e.class.name}</td>
                <td className="px-3 py-2.5 text-foreground-soft">{e.section.name}</td>
                <td className="px-3 py-2.5 tabular-nums text-foreground-soft">#{e.rollNumber}</td>
                <td className="px-3 py-2.5 font-mono text-xs text-foreground-soft">{e.studentNumber}</td>
                <td className="px-3 py-2.5 text-xs text-foreground-soft">
                  {formatDate(e.startDate)} – {e.endDate ? formatDate(e.endDate) : "present"}
                </td>
                <td className="px-5 py-2.5">
                  <Badge tone={ENROLLMENT_TONE[e.status]}>{e.status.replace(/_/g, " ")}</Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
