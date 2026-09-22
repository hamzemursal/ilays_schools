"use client";

import { useEffect, useState } from "react";
import { ApiError } from "@/lib/auth-context";
import type { MyChildAcademicYear, MyResultsReport, PortalResultRow, PortalTermResults } from "@/lib/api";
import { formatAverage } from "@/features/portal-results/PortalResults";
import { Card, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Alert } from "@/components/ui/Alert";
import { EmptyState } from "@/components/ui/EmptyState";
import { SkeletonCards } from "@/components/ui/Skeleton";
import { Select } from "@/components/ui/FormControls";
import { Award, BookLock, CalendarDays } from "lucide-react";

// The Student Portal's own presentation of exactly the same real report the
// shared PortalResults component already fetches and computes (see
// features/portal-results/PortalResults.tsx — ResultsSummary and
// formatAverage are reused unchanged from there, never re-derived here).
// This file ONLY changes layout/visuals for the Student Results page; the
// Parent Portal keeps using PortalResults/ResultsReportView exactly as
// before, untouched.
//
// Every figure shown here is one already present on MyResultsReport:
// term.results (PUBLISHED rows only — see ExamsService.getTermPercentage /
// StudentPortalService), term.percentage, term.weight and annual.*. A term
// with zero published rows is shown as "Not Published" — never a guessed or
// placeholder mark; an annual result of null is shown as "-" — never a
// fabricated 0.

function TermAccentIcon({ tone }: { tone: "term1" | "term2" }) {
  const cls = tone === "term1" ? "bg-accent-soft text-accent" : "bg-violet-50 text-violet-600";
  return (
    <div className={`flex size-9 shrink-0 items-center justify-center rounded-lg ${cls}`}>
      <BookLock className="size-4.5" />
    </div>
  );
}

function SubjectRow({ row }: { row: PortalResultRow }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2.5">
      <p className="min-w-0 truncate text-sm font-medium text-foreground">{row.subjectName}</p>
      <div className="flex shrink-0 items-center gap-3">
        <span className="text-sm tabular-nums text-foreground-soft">
          {row.marksObtained} / {row.maxMarks}
        </span>
        <Badge tone="accent">{row.percentage}%</Badge>
      </div>
    </div>
  );
}

// One term's card: real published subjects + the real term average, OR the
// honest "not published yet" state — never both, and never invented rows.
function TermResultsCard({ term, tone }: { term: PortalTermResults; tone: "term1" | "term2" }) {
  // A plain colored strip, not a border-side override — guaranteed to render
  // regardless of Tailwind's own utility ordering, unlike fighting the base
  // Card's `border` shorthand with a `border-t-*` override would be.
  const strip = tone === "term1" ? "bg-accent" : "bg-violet-400";
  const published = term.results.length > 0;

  return (
    <Card padding="none" className="overflow-hidden">
      <div className={`h-1.5 ${strip}`} aria-hidden />
      <div className="flex items-center gap-3 border-b border-border px-5 py-4">
        <TermAccentIcon tone={tone} />
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-foreground">{term.name} Results</h3>
          <p className="text-xs text-foreground-muted">{term.weight !== null ? `Weight: ${term.weight}% of the annual result` : "Weight not set"}</p>
        </div>
      </div>

      <div className="px-5 py-4">
        {published ? (
          <div className="divide-y divide-border">
            {term.results.map((r) => (
              <SubjectRow key={r.id} row={r} />
            ))}
          </div>
        ) : (
          <div className="py-6 text-center">
            <BookLock className="mx-auto size-6 text-foreground-muted" />
            <p className="mt-2 text-sm font-semibold text-foreground-soft">Not Published</p>
            <p className="mt-1 text-xs text-foreground-muted">No results available for {term.name} yet.</p>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between border-t border-border bg-surface-soft px-5 py-3">
        <span className="text-xs font-semibold uppercase tracking-wide text-foreground-muted">{term.name} Average</span>
        <span className="text-lg font-semibold tabular-nums text-foreground">{formatAverage(term.percentage)}</span>
      </div>
    </Card>
  );
}

// The combined annual figure — visually distinct (green) from the two term
// cards, and honest about what it needs: real Term 1 AND Term 2 published
// results, the same rule ExamsService.getAnnualResult already enforces.
function OverallAverageCard({ report }: { report: MyResultsReport }) {
  const { annual, terms } = report;
  const complete = annual.annualPercentage !== null;

  return (
    <Card padding="none" className="overflow-hidden bg-success-soft/30">
      <div className="h-1.5 bg-success" aria-hidden />
      <div className="flex items-center gap-3 border-b border-border px-5 py-4">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-success-soft text-success">
          <Award className="size-4.5" />
        </div>
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-foreground">Overall Average</h3>
          <p className="text-xs text-foreground-muted">Combines Term 1 and Term 2</p>
        </div>
      </div>

      <div className="flex flex-col items-center justify-center px-5 py-8 text-center">
        <p className="text-4xl font-bold tabular-nums text-success">{complete ? formatAverage(annual.annualPercentage) : "-"}</p>
        {!complete && (
          <p className="mt-3 max-w-[220px] text-sm text-foreground-soft">
            The Overall Average becomes available once both Term 1 and Term 2 results are published.
          </p>
        )}
      </div>

      <div className="space-y-2 border-t border-border px-5 py-4">
        <div className="flex items-center justify-between text-sm">
          <span className="text-foreground-soft">Term 1{terms[0].weight !== null ? ` (${terms[0].weight}%)` : ""}</span>
          <span className="font-medium tabular-nums text-foreground">{formatAverage(annual.term1Percentage)}</span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-foreground-soft">Term 2{terms[1].weight !== null ? ` (${terms[1].weight}%)` : ""}</span>
          <span className="font-medium tabular-nums text-foreground">{formatAverage(annual.term2Percentage)}</span>
        </div>
      </div>
    </Card>
  );
}

function OtherResultsCard({ rows }: { rows: PortalResultRow[] }) {
  if (rows.length === 0) return null;
  return (
    <Card padding="none">
      <CardHeader
        title="Other published results"
        description="Exams that are not assigned to a term. They are not part of the term or annual averages."
      />
      <div className="divide-y divide-border px-5">
        {rows.map((r) => (
          <SubjectRow key={r.id} row={r} />
        ))}
      </div>
    </Card>
  );
}

// One academic year's report, fully self-contained so switching years (see
// StudentResultsView below) never mixes one year's cards with another's —
// remounted by key on academicYearId, same mechanism PortalResults uses.
export function StudentYearReportView({ report }: { report: MyResultsReport }) {
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold text-foreground">{report.academicYear.name}</h2>
          <p className="text-sm text-foreground-soft">
            {report.enrollment.className} · Section {report.enrollment.sectionName} · {report.enrollment.schoolName}
          </p>
        </div>
        {report.academicYear.isCurrent && <Badge tone="accent">Current year</Badge>}
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <TermResultsCard term={report.terms[0]} tone="term1" />
        <TermResultsCard term={report.terms[1]} tone="term2" />
        <OverallAverageCard report={report} />
      </div>

      <OtherResultsCard rows={report.otherResults} />
    </div>
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
  if (!report) return <SkeletonCards count={3} />;
  return <StudentYearReportView report={report} />;
}

// Same data contract as PortalResults (loadYears/loadReport are already-
// bound, token-scoped loaders the caller owns) — only the presentation
// below the year picker differs. isCurrent-first ordering, error/empty
// states and the "remount per year" behavior are all unchanged.
export function StudentResultsView({
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
  if (!years) return <SkeletonCards count={3} />;
  if (years.length === 0) {
    return (
      <Card>
        <EmptyState icon={CalendarDays} title="No academic year on record" description="There is no enrollment history to show results for yet." />
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <CalendarDays className="size-4.5 text-foreground-muted" />
            <div>
              <p className="text-sm font-semibold text-foreground">Academic year</p>
              <p className="mt-0.5 text-sm text-foreground-soft">Each year&apos;s results are shown on their own — choose a year to view it.</p>
            </div>
          </div>
          <Select value={selectedYearId ?? ""} onChange={(e) => setSelectedYearId(e.target.value)} className="w-auto min-w-[200px]">
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
    </div>
  );
}
