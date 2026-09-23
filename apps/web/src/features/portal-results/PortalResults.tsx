"use client";

import { useEffect, useState } from "react";
import { ApiError } from "@/lib/auth-context";
import type { MyChildAcademicYear, MyResultsReport, PortalResultRow, PortalTermResults } from "@/lib/api";
import { Card, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Alert } from "@/components/ui/Alert";
import { EmptyState } from "@/components/ui/EmptyState";
import { SkeletonCards } from "@/components/ui/Skeleton";
import { Select } from "@/components/ui/FormControls";
import { CalendarDays } from "lucide-react";

// Term and annual figures come from the server already computed (the same
// SUM(marks)/SUM(max) and weighted combination promotion uses); this only
// formats them. Two decimals here, one decimal on individual result rows.
export function formatAverage(percentage: number | null): string {
  return percentage === null ? "Incomplete" : `${percentage.toFixed(2)}%`;
}

function SummaryFigure({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-foreground-muted">{label}</p>
      <div className="mt-1 text-xl font-semibold tabular-nums text-foreground">{children}</div>
    </div>
  );
}

// Term 1 Result, Term 2 Result and the Annual / Combined Result for one
// academic year. Deliberately NO eligibility or pass/fail verdict: promotion
// eligibility is an Admin concept and is never sent to a student or parent. Shared by the Student Portal, the Parent Portal Results tab
// and the Parent Portal Performance tab so all three show identical numbers.
export function ResultsSummary({ report }: { report: MyResultsReport }) {
  const { annual, terms } = report;
  const weights = terms.map((t) => t.weight);
  return (
    <Card padding="none">
      <CardHeader
        title="Annual result"
        description={
          weights[0] !== null && weights[1] !== null
            ? `Combines Term 1 (${weights[0]}%) and Term 2 (${weights[1]}%).`
            : "Term weights have not been set for this academic year."
        }
      />
      <div className="grid grid-cols-1 gap-4 px-5 pb-5 sm:grid-cols-3">
        <SummaryFigure label="Term 1 Result">{formatAverage(annual.term1Percentage)}</SummaryFigure>
        <SummaryFigure label="Term 2 Result">{formatAverage(annual.term2Percentage)}</SummaryFigure>
        <SummaryFigure label="Annual / Combined Result">{formatAverage(annual.annualPercentage)}</SummaryFigure>
      </div>
      {annual.annualPercentage === null && (
        <p className="px-5 pb-5 text-sm text-foreground-soft">
          The annual result appears once both Term 1 and Term 2 results have been published.
        </p>
      )}
    </Card>
  );
}

export function ResultsTable({ rows }: { rows: PortalResultRow[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead className="bg-surface-soft text-xs font-semibold uppercase tracking-wide text-foreground-muted">
          <tr>
            <th className="px-5 py-2.5">Exam</th>
            <th className="px-5 py-2.5">Subject</th>
            <th className="px-5 py-2.5">Marks</th>
            <th className="px-5 py-2.5">Percentage</th>
            <th className="px-5 py-2.5">Exam Date</th>
            <th className="px-5 py-2.5">Published</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((r) => (
            <tr key={r.id}>
              <td className="px-5 py-3 text-foreground">
                {r.examName}
              </td>
              <td className="px-5 py-3 text-foreground-soft">{r.subjectName}</td>
              <td className="px-5 py-3 whitespace-nowrap text-foreground-soft">
                {r.marksObtained} / {r.maxMarks}
              </td>
              <td className="px-5 py-3">
                <Badge tone="accent">{r.percentage}%</Badge>
              </td>
              <td className="px-5 py-3 text-foreground-muted">
                {r.examDate ? new Date(r.examDate).toLocaleDateString() : "—"}
              </td>
              <td className="px-5 py-3 text-foreground-muted">
                {r.publishedDate ? new Date(r.publishedDate).toLocaleDateString() : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function TermCard({ term }: { term: PortalTermResults }) {
  return (
    <Card padding="none">
      <CardHeader
        title={term.name}
        description={`Term average: ${formatAverage(term.percentage)}${term.weight !== null ? ` · weight ${term.weight}%` : ""}`}
      />
      {term.results.length === 0 ? (
        <p className="px-5 pb-5 text-sm text-foreground-soft">No published results for {term.name} yet.</p>
      ) : (
        <ResultsTable rows={term.results} />
      )}
    </Card>
  );
}

export function ResultsReportView({ report }: { report: MyResultsReport }) {
  return (
    <>
      <p className="text-sm text-foreground-soft">
        {report.academicYear.name} · {report.enrollment.className} · Section {report.enrollment.sectionName} ·{" "}
        {report.enrollment.schoolName}
      </p>
      <ResultsSummary report={report} />
      <TermCard term={report.terms[0]} />
      <TermCard term={report.terms[1]} />
      {report.otherResults.length > 0 && (
        <Card padding="none">
          <CardHeader
            title="Other published results"
            description="Exams that are not assigned to a term. They are not part of the term or annual averages."
          />
          <ResultsTable rows={report.otherResults} />
        </Card>
      )}
    </>
  );
}

// Year picker + report for the signed-in student or the selected child. The
// callers hand in already-bound loaders (memoized on token/child) so this
// component never knows whose data it is — ownership is the server's job.
export function PortalResults({
  loadYears,
  loadReport,
}: {
  loadYears: () => Promise<MyChildAcademicYear[]>;
  loadReport: (academicYearId: string) => Promise<MyResultsReport>;
}) {
  const [years, setYears] = useState<MyChildAcademicYear[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedYearId, setSelectedYearId] = useState<string | null>(null);

  useEffect(() => {
    loadYears()
      .then((list) => {
        setYears(list);
        setSelectedYearId(list.find((y) => y.isCurrent)?.id ?? list[0]?.id ?? null);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load academic years"));
  }, [loadYears]);

  if (error) return <Alert tone="danger">{error}</Alert>;
  if (!years) return <SkeletonCards count={2} />;
  if (years.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={CalendarDays}
          title="No academic year on record"
          description="There is no enrollment history to show results for yet."
        />
      </Card>
    );
  }

  return (
    <>
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-foreground">Academic year</p>
            <p className="mt-0.5 text-sm text-foreground-soft">Choose a year to view its published results.</p>
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

      {selectedYearId && <YearReport key={selectedYearId} academicYearId={selectedYearId} loadReport={loadReport} />}
    </>
  );
}

function YearReport({
  academicYearId,
  loadReport,
}: {
  academicYearId: string;
  loadReport: (academicYearId: string) => Promise<MyResultsReport>;
}) {
  const [report, setReport] = useState<MyResultsReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadReport(academicYearId)
      .then(setReport)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load results"));
  }, [academicYearId, loadReport]);

  if (error) return <Alert tone="danger">{error}</Alert>;
  if (!report) return <SkeletonCards count={2} />;
  return <ResultsReportView report={report} />;
}
