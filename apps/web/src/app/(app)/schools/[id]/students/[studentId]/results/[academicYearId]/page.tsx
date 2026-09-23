"use client";

import { use, useEffect, useState } from "react";
import { useAuth, ApiError } from "@/lib/auth-context";
import { type MyResultsReport, type StudentDetail } from "@/lib/api";
import { studentsApi } from "@/features/students/api";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Alert } from "@/components/ui/Alert";
import { EmptyState } from "@/components/ui/EmptyState";
import { SkeletonCards } from "@/components/ui/Skeleton";
import { ResultsSummary, ResultsTable, TermCard } from "@/features/portal-results/PortalResults";
import { ClipboardCheck } from "lucide-react";

// The dedicated results page for ONE student's ONE academic year, reached
// from the Academic History tab's "View Results" link. Deliberately reuses
// the exact same data (StudentsService.getResultsReport, which wraps the
// shared buildStudentResultsReport — see exams/student-results-report.ts)
// and the exact same presentation pieces (ResultsSummary/TermCard/
// ResultsTable) the Student/Parent Portal's own results page already uses —
// this is a new place to VIEW that data, never a second way to compute it.
export default function StudentResultsDetailPage({
  params,
}: {
  params: Promise<{ id: string; studentId: string; academicYearId: string }>;
}) {
  const { id: schoolId, studentId, academicYearId } = use(params);
  const { accessToken } = useAuth();

  const [student, setStudent] = useState<StudentDetail | null>(null);
  const [report, setReport] = useState<MyResultsReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken) return;
    setStudent(null);
    setReport(null);
    setError(null);
    Promise.all([studentsApi.getOne(accessToken, studentId), studentsApi.getResultsReport(accessToken, studentId, academicYearId)])
      .then(([s, r]) => {
        setStudent(s);
        setReport(r);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load results"));
  }, [accessToken, studentId, academicYearId]);

  const studentName = student ? `${student.firstName} ${student.lastName}` : "Student";

  if (error) {
    return (
      <div className="p-4 sm:p-6">
        <Alert tone="danger">{error}</Alert>
      </div>
    );
  }
  if (!student || !report) {
    return (
      <div className="p-4 sm:p-6">
        <SkeletonCards count={3} />
      </div>
    );
  }

  // The exact enrollment this report's academic year belongs to — real Roll
  // No./Student No. for THAT year specifically, never the student's current
  // enrollment stamped onto a past year. May be absent if this actor can see
  // the report (their own school's enrollment) but not this OTHER school's
  // historical enrollment row — shown as "—" rather than guessed.
  const enrollment = student.enrollments.find((e) => e.academicYear.id === academicYearId) ?? null;

  // Nothing published for this year at all — never render marks, averages,
  // grades, or a subject table; a clean "not published" empty state instead.
  const isEmpty =
    report.terms.every((t) => t.results.length === 0) &&
    report.otherResults.length === 0 &&
    report.annual.annualPercentage === null;

  return (
    <div>
      <PageHeader
        eyebrow="Students"
        title={`${studentName} — Results`}
        description={`${report.academicYear.name} · ${report.enrollment.className} · Section ${report.enrollment.sectionName}`}
        breadcrumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Students", href: `/schools/${schoolId}/students` },
          { label: studentName, href: `/schools/${schoolId}/students/${studentId}` },
          { label: "Results" },
        ]}
      />

      <div className="space-y-5 p-4 sm:p-6">
        <Card>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-lg font-semibold text-foreground">{studentName}</p>
              <p className="mt-0.5 text-sm text-foreground-muted">Student No: {enrollment?.studentNumber ?? "—"}</p>
            </div>
            <div className="text-left sm:text-right">
              <p className="text-sm font-medium text-foreground">{report.enrollment.schoolName}</p>
              <div className="mt-1.5">
                <Badge tone={isEmpty ? "neutral" : "success"}>{isEmpty ? "Not Published" : "Published"}</Badge>
              </div>
            </div>
          </div>
        </Card>

        {isEmpty ? (
          <Card>
            <EmptyState
              icon={ClipboardCheck}
              title="Results not published yet"
              description="No results have been published for this academic year yet."
            />
          </Card>
        ) : (
          <>
            <ResultsSummary report={report} />
            <TermCard term={report.terms[0]} />
            <TermCard term={report.terms[1]} />
            {report.otherResults.length > 0 && (
              <Card padding="none">
                <div className="border-b border-border p-5">
                  <h3 className="text-sm font-semibold text-foreground">Other published results</h3>
                  <p className="mt-0.5 text-sm text-foreground-soft">
                    Exams that are not assigned to a term. They are not part of the term or annual averages.
                  </p>
                </div>
                <ResultsTable rows={report.otherResults} />
              </Card>
            )}
          </>
        )}
      </div>
    </div>
  );
}
