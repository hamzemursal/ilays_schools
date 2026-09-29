"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth, ApiError } from "@/lib/auth-context";
import { api, type MyChildSubject, type MyResultsReport, type PortalTermResults } from "@/lib/api";
import { useSelectedChild } from "@/features/parent-portal/SelectedChildContext";
import { CHILD_TONES, PillTabs } from "@/features/parent-portal/ParentUI";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardHeader } from "@/components/ui/Card";
import { Alert } from "@/components/ui/Alert";
import { EmptyState } from "@/components/ui/EmptyState";
import { SkeletonCards } from "@/components/ui/Skeleton";
import { PortalResults, ResultsSummary } from "@/features/portal-results/PortalResults";
import { PortalLocaleProvider } from "@/lib/portal-locale";
import { BookOpen, TrendingUp, UserSquare2, Users } from "lucide-react";

const TABS = ["Maaddooyinka", "Imtixaannada & Natiijooyinka", "Horumarka"] as const;
type Tab = (typeof TABS)[number];

export default function AcademicsPage() {
  const { accessToken } = useAuth();
  const { selectedChild, loading: childrenLoading, children } = useSelectedChild();
  const [tab, setTab] = useState<Tab>("Maaddooyinka");

  return (
    <div>
      <PageHeader
        variant="plain"
        eyebrow="Portal-ka Waalidka"
        title="Waxbarashada"
        description={
          selectedChild
            ? `Maaddooyinka, natiijooyinka imtixaannada iyo horumarka ${selectedChild.firstName}.`
            : "Maaddooyinka, natiijooyinka imtixaannada iyo horumarka."
        }
      />

      <div className="space-y-5 px-3 pb-8 pt-4 sm:px-5">
        <PillTabs tabs={TABS} active={tab} onChange={setTab} />
        {childrenLoading ? (
          <SkeletonCards count={2} />
        ) : children.length === 0 ? (
          <EmptyState icon={Users} title="Weli ilmo laguma xirin akoonkaaga" />
        ) : !selectedChild || !accessToken ? (
          <EmptyState icon={Users} title="Kor ka dooro ilmo" />
        ) : tab === "Maaddooyinka" ? (
          <SubjectsTab key={selectedChild.studentId} accessToken={accessToken} studentId={selectedChild.studentId} />
        ) : tab === "Imtixaannada & Natiijooyinka" ? (
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
      .catch((err) => setError(err instanceof ApiError ? err.message : "Lama soo rarin maaddooyinka"));
  }, [accessToken, studentId]);

  if (error) return <Alert tone="danger">{error}</Alert>;
  if (!subjects) return <SkeletonCards count={2} />;
  if (subjects.length === 0) return <EmptyState icon={BookOpen} title="Weli maaddo looma qoondeyn" />;

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {subjects.map((s, i) => {
        const tone = CHILD_TONES[i % CHILD_TONES.length];
        return (
          <div key={s.subjectId} className="flex items-start gap-3 rounded-2xl border border-border bg-background p-4 shadow-sm">
            <span className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${tone.soft} ${tone.text}`}>
              <BookOpen className="size-5" />
            </span>
            <div className="min-w-0">
              <p className="font-semibold text-foreground">
                {s.name}
                {s.code && <span className="ml-1 font-mono text-xs text-foreground-muted">· {s.code}</span>}
              </p>
              <p className="mt-1 flex items-center gap-1.5 text-sm text-foreground-soft">
                <UserSquare2 className="size-3.5 shrink-0 text-foreground-muted" />
                {s.teacher ? `Macallinka: ${s.teacher.firstName} ${s.teacher.lastName}` : "Weli macallin looma qoondeyn"}
              </p>
            </div>
          </div>
        );
      })}
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
    <PortalLocaleProvider locale="so">
      <div className="space-y-5">
        <PortalResults loadYears={loadYears} loadReport={loadReport} />
      </div>
    </PortalLocaleProvider>
  );
}

// Per-subject average across one term's published results: SUM(marks)/SUM(max),
// the same rule as the term average itself — never a mean of percentages.
function subjectAverages(terms: PortalTermResults[]) {
  const bySubject = new Map<string, { marks: number; max: number }>();
  for (const r of terms.flatMap((t) => t.results)) {
    // Incomplete has no mark at all — it must never enter this sum (not even
    // as a 0), exactly like the server's own term/annual average excludes it.
    if (r.status === "INCOMPLETE" || r.marksObtained === null) continue;
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
      .catch((err) => setError(err instanceof ApiError ? err.message : "Lama soo rarin horumarka"));
  }, [accessToken, studentId]);

  if (error) return <Alert tone="danger">{error}</Alert>;
  if (!report) return <SkeletonCards count={1} />;

  const averages = subjectAverages(report.terms);
  if (averages.length === 0) return <EmptyState icon={TrendingUp} title="Weli natiijo lama daabicin" />;

  return (
    <div className="space-y-5">
      <p className="text-sm text-foreground-soft">
        {report.academicYear.name} · {report.enrollment.className} · Fasalka {report.enrollment.sectionName}
      </p>
      <PortalLocaleProvider locale="so">
        <ResultsSummary report={report} />
      </PortalLocaleProvider>

      <Card padding="none" className="rounded-2xl">
        <CardHeader title="Celceliska maaddo kasta" description={`Natiijooyinka la daabacay ee ${report.academicYear.name}.`} />
        <div className="divide-y divide-border">
          {averages.map((s) => (
            <div key={s.name} className="flex items-center justify-between gap-3 px-5 py-3">
              <span className="text-sm font-medium text-foreground">{s.name}</span>
              <div className="flex items-center gap-3">
                <div className="h-2 w-32 overflow-hidden rounded-full bg-surface sm:w-48">
                  <div
                    className="h-full rounded-full bg-accent"
                    style={{ width: `${Math.min(100, s.average)}%` }}
                  />
                </div>
                <span className="w-12 text-right text-sm font-semibold tabular-nums text-foreground">{s.average}%</span>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
