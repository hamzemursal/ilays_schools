"use client";

import { useEffect, useState } from "react";
import { useAuth, ApiError } from "@/lib/auth-context";
import { api, type MyChildResult } from "@/lib/api";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardHeader } from "@/components/ui/Card";
import { Alert } from "@/components/ui/Alert";
import { EmptyState } from "@/components/ui/EmptyState";
import { SkeletonCards } from "@/components/ui/Skeleton";
import { Award } from "lucide-react";

export default function StudentResultsPage() {
  const { accessToken } = useAuth();
  const [results, setResults] = useState<MyChildResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken) return;
    api
      .getMyStudentResults(accessToken)
      .then(setResults)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load results"));
  }, [accessToken]);

  return (
    <div>
      <PageHeader eyebrow="Student Portal" title="Results" description="Your approved exam results." />

      <div className="space-y-5 p-4 sm:p-6">
        {error ? (
          <Alert tone="danger">{error}</Alert>
        ) : !results ? (
          <SkeletonCards count={2} />
        ) : results.length === 0 ? (
          <Card>
            <EmptyState
              icon={Award}
              title="Results are not available yet"
              description="Approved exam results will appear here once your teachers finalize them."
            />
          </Card>
        ) : (
          <Card padding="none">
            <CardHeader title="Approved results" description={`${results.length} result(s).`} />
            <div className="overflow-x-auto">
              <table className="w-full min-w-[600px] text-left text-sm">
                <thead className="bg-surface-soft text-xs font-semibold uppercase tracking-wide text-foreground-muted">
                  <tr>
                    <th className="px-5 py-2.5">Exam</th>
                    <th className="px-5 py-2.5">Subject</th>
                    <th className="px-5 py-2.5">Marks</th>
                    <th className="px-5 py-2.5">Percentage</th>
                    <th className="px-5 py-2.5">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {results.map((r) => (
                    <tr key={r.id}>
                      <td className="px-5 py-3 text-foreground">
                        {r.examName}
                        <span className="ml-1.5 text-xs text-foreground-muted">({r.examType})</span>
                      </td>
                      <td className="px-5 py-3 text-foreground-soft">{r.subjectName}</td>
                      <td className="px-5 py-3 whitespace-nowrap text-foreground-soft">
                        {r.marksObtained} / {r.maxMarks}
                      </td>
                      <td className="px-5 py-3 font-medium text-foreground">{r.percentage}%</td>
                      <td className="px-5 py-3 text-foreground-muted">
                        {r.examDate ? new Date(r.examDate).toLocaleDateString() : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
