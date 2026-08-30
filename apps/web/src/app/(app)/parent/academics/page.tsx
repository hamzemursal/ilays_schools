"use client";

import { useEffect, useState } from "react";
import { useAuth, ApiError } from "@/lib/auth-context";
import { api, type MyChildResult, type MyChildSubject } from "@/lib/api";
import { useSelectedChild } from "@/features/parent-portal/SelectedChildContext";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Alert } from "@/components/ui/Alert";
import { EmptyState } from "@/components/ui/EmptyState";
import { SkeletonCards } from "@/components/ui/Skeleton";
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
  const [results, setResults] = useState<MyChildResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .getMyChildResults(accessToken, studentId)
      .then(setResults)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load results"));
  }, [accessToken, studentId]);

  if (error) return <Alert tone="danger">{error}</Alert>;
  if (!results) return <SkeletonCards count={2} />;
  if (results.length === 0) return <EmptyState icon={BookOpen} title="No published results yet" />;

  return (
    <Card padding="none">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-left text-sm">
          <thead className="bg-surface-soft text-xs font-semibold uppercase tracking-wide text-foreground-muted">
            <tr>
              <th className="px-5 py-2.5">Exam</th>
              <th className="px-5 py-2.5">Subject</th>
              <th className="px-5 py-2.5">Marks</th>
              <th className="px-5 py-2.5">Percentage</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {results.map((r) => (
              <tr key={r.id}>
                <td className="px-5 py-3 text-foreground">
                  {r.examName}
                  <span className="ml-1.5 text-xs text-foreground-muted">{r.examType}</span>
                </td>
                <td className="px-5 py-3 text-foreground-soft">{r.subjectName}</td>
                <td className="px-5 py-3 text-foreground-soft">
                  {r.marksObtained} / {r.maxMarks}
                </td>
                <td className="px-5 py-3">
                  <Badge tone={r.percentage >= 50 ? "success" : "danger"}>{r.percentage}%</Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function PerformanceTab({ accessToken, studentId }: { accessToken: string; studentId: string }) {
  const [results, setResults] = useState<MyChildResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .getMyChildResults(accessToken, studentId)
      .then(setResults)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load performance"));
  }, [accessToken, studentId]);

  if (error) return <Alert tone="danger">{error}</Alert>;
  if (!results) return <SkeletonCards count={1} />;
  if (results.length === 0) return <EmptyState icon={TrendingUp} title="No published results yet" />;

  const overallAverage = Math.round((results.reduce((sum, r) => sum + r.percentage, 0) / results.length) * 10) / 10;

  const bySubject = new Map<string, number[]>();
  for (const r of results) {
    const list = bySubject.get(r.subjectName) ?? [];
    list.push(r.percentage);
    bySubject.set(r.subjectName, list);
  }
  const subjectAverages = Array.from(bySubject.entries())
    .map(([name, pcts]) => ({ name, average: Math.round((pcts.reduce((s, p) => s + p, 0) / pcts.length) * 10) / 10 }))
    .sort((a, b) => b.average - a.average);

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader title="Overall average" />
        <p className="mt-2 text-3xl font-semibold text-foreground">{overallAverage}%</p>
        <p className="mt-1 text-sm text-foreground-soft">Across {results.length} published result(s).</p>
      </Card>

      <Card padding="none">
        <CardHeader title="Average by subject" />
        <div className="divide-y divide-border">
          {subjectAverages.map((s) => (
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
