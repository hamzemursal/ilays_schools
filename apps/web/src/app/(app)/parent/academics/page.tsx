"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth, ApiError } from "@/lib/auth-context";
import { api, type MyChildSubject, type MyResultsReport, type PortalTermResults } from "@/lib/api";
import { useSelectedChild } from "@/features/parent-portal/SelectedChildContext";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardHeader } from "@/components/ui/Card";
import { Alert } from "@/components/ui/Alert";
import { EmptyState } from "@/components/ui/EmptyState";
import { SkeletonCards } from "@/components/ui/Skeleton";
import { PortalResults, ResultsSummary } from "@/features/portal-results/PortalResults";
import { BookOpen, TrendingUp, Users } from "lucide-react";

const TABS = ["Subjects", "Exams & Results", "Performance"] as const;
type Tab = (typeof TABS)[number];

export default function AcademicsPage() {
  const { accessToken } = useAuth();
  const { selectedChild, loading: childrenLoading, children } = useSelectedChild();
  const [tab, setTab] = useState<Tab>("Subjects");

  return (
    <div>
      <PageHeader eyebrow="Parent Portal" title="Academics" description="Subjects, exam results, and performance." />

      <div className="border-b border-border px-4 sm:px-6">
        <div className="flex gap-1 overflow-x-auto">
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`shrink-0 border-b-2 px-3 py-3 text-sm font-medium transition-colors ${
                tab === t ? "border-accent text-accent" : "border-transparent text-foreground-soft hover:text-foreground"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      <div className="p-4 sm:p-6">
        {childrenLoading ? (
          <SkeletonCards count={2} />
        ) : children.length === 0 ? (
          <EmptyState icon={Users} title="No children linked yet" />
        ) : !selectedChild || !accessToken ? (
          <EmptyState icon={Users} title="Select a child above" />
        ) : tab === "Subjects" ? (
          <SubjectsTab key={selectedChild.studentId} accessToken={accessToken} studentId={selectedChild.studentId} />
        ) : tab === "Exams & Results" ? (
          <ResultsTab key={selectedChild.studentId} accessToken={accessToken} studentId={selectedChild.studentId} />
        ) : (
          <PerformanceTab key={selectedChild.studentId} accessToken={accessToken} studentId={selectedChild.studentId} />
        )}
      </div>
    </div>
  );
}

function SubjectsTab({ accessToken, studentId }: { accessToken: string; studentId: string }) {
  const [subjects, setSubjects] = useState<MyChildSubject[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .getMyChildSubjects(accessToken, studentId)
      .then(setSubjects)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load subjects"));
  }, [accessToken, studentId]);

  if (error) return <Alert tone="danger">{error}</Alert>;
  if (!subjects) return <SkeletonCards count={2} />;
  if (subjects.length === 0) return <EmptyState icon={BookOpen} title="No subjects assigned yet" />;

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {subjects.map((s) => (
        <Card key={s.subjectId}>
          <p className="font-medium text-foreground">
            {s.name}
            {s.code && <span className="ml-1 font-mono text-xs text-foreground-muted">· {s.code}</span>}
          </p>
          <p className="mt-1 text-sm text-foreground-soft">
            {s.teacher ? `Teacher: ${s.teacher.firstName} ${s.teacher.lastName}` : "No teacher assigned yet"}
          </p>
        </Card>
      ))}
    </div>
  );
}

function ResultsTab({ accessToken, studentId }: { accessToken: string; studentId: string }) {
  const loadYears = useCallback(() => api.getMyChildAcademicYears(accessToken, studentId), [accessToken, studentId]);
  const loadReport = useCallback(
    (academicYearId: string) => api.getMyChildResultsReport(accessToken, studentId, academicYearId),
    [accessToken, studentId],
  );
  return (
    <div className="space-y-5">
      <PortalResults loadYears={loadYears} loadReport={loadReport} />
    </div>
  );
}

// Per-subject average across one term's published results: SUM(marks)/SUM(max),
// the same rule as the term average itself — never a mean of percentages.
function subjectAverages(terms: PortalTermResults[]) {
  const bySubject = new Map<string, { marks: number; max: number }>();
  for (const r of terms.flatMap((t) => t.results)) {
    const totals = bySubject.get(r.subjectName) ?? { marks: 0, max: 0 };
    totals.marks += r.marksObtained;
    totals.max += r.maxMarks;
    bySubject.set(r.subjectName, totals);
  }
  return Array.from(bySubject.entries())
    .filter(([, t]) => t.max > 0)
    .map(([name, t]) => ({ name, average: Math.round((t.marks / t.max) * 1000) / 10 }))
    .sort((a, b) => b.average - a.average);
}

// The current academic year only — historical years live on the Exams &
// Results tab's year picker. Never a blend of years or terms.
function PerformanceTab({ accessToken, studentId }: { accessToken: string; studentId: string }) {
  const [report, setReport] = useState<MyResultsReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .getMyChildResultsReport(accessToken, studentId)
      .then(setReport)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load performance"));
  }, [accessToken, studentId]);

  if (error) return <Alert tone="danger">{error}</Alert>;
  if (!report) return <SkeletonCards count={1} />;

  const averages = subjectAverages(report.terms);
  if (averages.length === 0) return <EmptyState icon={TrendingUp} title="No published results yet" />;

  return (
    <div className="space-y-5">
      <p className="text-sm text-foreground-soft">
        {report.academicYear.name} · {report.enrollment.className} · Section {report.enrollment.sectionName}
      </p>
      <ResultsSummary report={report} />

      <Card padding="none">
        <CardHeader title="Average by subject" description={`Across the published results of ${report.academicYear.name}.`} />
        <div className="divide-y divide-border">
          {averages.map((s) => (
            <div key={s.name} className="flex items-center justify-between px-5 py-3">
              <span className="text-sm font-medium text-foreground">{s.name}</span>
              <div className="flex items-center gap-3">
                <div className="h-1.5 w-32 overflow-hidden rounded-full bg-surface">
                  <div
                    className={`h-full rounded-full ${s.average >= 50 ? "bg-success" : "bg-danger"}`}
                    style={{ width: `${Math.min(100, s.average)}%` }}
                  />
                </div>
                <span className="w-12 text-right text-sm text-foreground-soft">{s.average}%</span>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
