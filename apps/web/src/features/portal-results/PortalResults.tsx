"use client";

import { useEffect, useState } from "react";
import { ApiError } from "@/lib/auth-context";
import type { MyChildAcademicYear, MyResultsReport, PortalResultRow, PortalTermResults } from "@/lib/api";
import { usePortalLocale, type PortalLocale } from "@/lib/portal-locale";
import { Card, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Alert } from "@/components/ui/Alert";
import { EmptyState } from "@/components/ui/EmptyState";
import { SkeletonCards } from "@/components/ui/Skeleton";
import { Select } from "@/components/ui/FormControls";
import { CalendarDays } from "lucide-react";

// Labels in both portal languages: English (Student Portal, admin pages) and
// Somali (Parent Portal). The numbers are identical either way.
const TEXT = {
  en: {
    incomplete: "Incomplete",
    completed: "Completed",
    annualResult: "Annual result",
    combines: (a: number, b: number) => `Combines Term 1 (${a}%) and Term 2 (${b}%).`,
    noWeights: "Term weights have not been set for this academic year.",
    term1Result: "Term 1 Result",
    term2Result: "Term 2 Result",
    annualCombined: "Annual / Combined Result",
    annualPending: "The annual result appears once both Term 1 and Term 2 results have been published.",
    exam: "Exam",
    subject: "Subject",
    status: "Status",
    marks: "Marks",
    percentage: "Percentage",
    examDate: "Exam Date",
    published: "Published",
    termAverage: "Term average",
    weight: "weight",
    noTermResults: (term: string) => `No published results for ${term} yet.`,
    section: "Section",
    otherResults: "Other published results",
    otherResultsHint: "Exams that are not assigned to a term. They are not part of the term or annual averages.",
    loadYearsFailed: "Failed to load academic years",
    noYear: "No academic year on record",
    noYearHint: "There is no enrollment history to show results for yet.",
    academicYear: "Academic year",
    chooseYear: "Choose a year to view its published results.",
    current: " (Current)",
    loadResultsFailed: "Failed to load results",
    termName: (name: string) => name,
  },
  so: {
    incomplete: "Lama dhammaystirin",
    completed: "La dhammaystiray",
    annualResult: "Natiijada sannadka",
    combines: (a: number, b: number) => `Waxay isku darsataa Xilliga 1aad (${a}%) iyo Xilliga 2aad (${b}%).`,
    noWeights: "Miisaanka xilliyada weli looma dejin sannad-dugsiyeedkan.",
    term1Result: "Natiijada Xilliga 1aad",
    term2Result: "Natiijada Xilliga 2aad",
    annualCombined: "Natiijada guud ee sannadka",
    annualPending: "Natiijada sannadku waxay soo baxaysaa marka natiijooyinka labada xilli la daabaco.",
    exam: "Imtixaan",
    subject: "Maaddo",
    status: "Xaalad",
    marks: "Dhibcaha",
    percentage: "Boqolley",
    examDate: "Taariikhda imtixaanka",
    published: "La daabacay",
    termAverage: "Celceliska xilliga",
    weight: "miisaan",
    noTermResults: (term: string) => `Weli lama daabicin natiijooyinka ${term}.`,
    section: "Fasalka",
    otherResults: "Natiijooyin kale oo la daabacay",
    otherResultsHint: "Imtixaanno aan xilli loo qoondeyn. Kuma jiraan celceliska xilliga ama sannadka.",
    loadYearsFailed: "Lama soo rarin sannadaha dugsiga",
    noYear: "Ma jiro sannad-dugsiyeed la diiwaangeliyay",
    noYearHint: "Weli ma jiro diiwaan-gelin natiijo loo muujiyo.",
    academicYear: "Sannad-dugsiyeedka",
    chooseYear: "Dooro sannad si aad u aragto natiijooyinkiisa la daabacay.",
    current: " (Hadda)",
    loadResultsFailed: "Lama soo rarin natiijooyinka",
    termName: (name: string) => (name === "Term 1" ? "Xilliga 1aad" : name === "Term 2" ? "Xilliga 2aad" : name),
  },
} as const;

function useText() {
  return TEXT[usePortalLocale()];
}

function formatDate(value: string, locale: PortalLocale): string {
  try {
    return new Date(value).toLocaleDateString(locale === "so" ? "so-SO" : undefined);
  } catch {
    return new Date(value).toLocaleDateString();
  }
}

// Term and annual figures come from the server already computed (the same
// SUM(marks)/SUM(max) and weighted combination promotion uses); this only
// formats them. Two decimals here, one decimal on individual result rows.
export function formatAverage(percentage: number | null, locale: PortalLocale = "en"): string {
  return percentage === null ? TEXT[locale].incomplete : `${percentage.toFixed(2)}%`;
}

function SummaryFigure({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-surface-soft p-4">
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
  const t = useText();
  const locale = usePortalLocale();
  const { annual, terms } = report;
  const weights = terms.map((term) => term.weight);
  return (
    <Card padding="none" className="rounded-2xl">
      <CardHeader
        title={t.annualResult}
        description={weights[0] !== null && weights[1] !== null ? t.combines(weights[0], weights[1]) : t.noWeights}
      />
      <div className="grid grid-cols-1 gap-3 px-5 pb-5 sm:grid-cols-3">
        <SummaryFigure label={t.term1Result}>{formatAverage(annual.term1Percentage, locale)}</SummaryFigure>
        <SummaryFigure label={t.term2Result}>{formatAverage(annual.term2Percentage, locale)}</SummaryFigure>
        <SummaryFigure label={t.annualCombined}>{formatAverage(annual.annualPercentage, locale)}</SummaryFigure>
      </div>
      {annual.annualPercentage === null && <p className="px-5 pb-5 text-sm text-foreground-soft">{t.annualPending}</p>}
    </Card>
  );
}

export function ResultsTable({ rows }: { rows: PortalResultRow[] }) {
  const t = useText();
  const locale = usePortalLocale();
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead className="bg-surface-soft text-xs font-semibold uppercase tracking-wide text-foreground-muted">
          <tr>
            <th className="px-5 py-2.5">{t.exam}</th>
            <th className="px-5 py-2.5">{t.subject}</th>
            <th className="px-5 py-2.5">{t.status}</th>
            <th className="px-5 py-2.5">{t.marks}</th>
            <th className="px-5 py-2.5">{t.percentage}</th>
            <th className="px-5 py-2.5">{t.examDate}</th>
            <th className="px-5 py-2.5">{t.published}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((r) => {
            const isIncomplete = r.status === "INCOMPLETE";
            return (
              <tr key={r.id}>
                <td className="px-5 py-3 text-foreground">{r.examName}</td>
                <td className="px-5 py-3 text-foreground-soft">{r.subjectName}</td>
                <td className="px-5 py-3">
                  <Badge tone={isIncomplete ? "neutral" : "success"}>{isIncomplete ? t.incomplete : t.completed}</Badge>
                </td>
                <td className="px-5 py-3 whitespace-nowrap text-foreground-soft">
                  {isIncomplete ? "—" : `${r.marksObtained} / ${r.maxMarks}`}
                </td>
                <td className="px-5 py-3">
                  {/* A real, completed 0% is shown as a percentage like any
                      other; Incomplete never gets a percentage at all —
                      never displayed or implied as 0%. */}
                  {isIncomplete ? <span className="text-foreground-muted">—</span> : <Badge tone="accent">{r.percentage}%</Badge>}
                </td>
                <td className="px-5 py-3 text-foreground-muted">{r.examDate ? formatDate(r.examDate, locale) : "—"}</td>
                <td className="px-5 py-3 text-foreground-muted">{r.publishedDate ? formatDate(r.publishedDate, locale) : "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function TermCard({ term }: { term: PortalTermResults }) {
  const t = useText();
  const locale = usePortalLocale();
  const name = t.termName(term.name);
  return (
    <Card padding="none" className="rounded-2xl">
      <CardHeader
        title={name}
        description={`${t.termAverage}: ${formatAverage(term.percentage, locale)}${term.weight !== null ? ` · ${t.weight} ${term.weight}%` : ""}`}
      />
      {term.results.length === 0 ? (
        <p className="px-5 pb-5 text-sm text-foreground-soft">{t.noTermResults(name)}</p>
      ) : (
        <ResultsTable rows={term.results} />
      )}
    </Card>
  );
}

export function ResultsReportView({ report }: { report: MyResultsReport }) {
  const t = useText();
  return (
    <>
      <p className="text-sm text-foreground-soft">
        {report.academicYear.name} · {report.enrollment.className} · {t.section} {report.enrollment.sectionName} ·{" "}
        {report.enrollment.schoolName}
      </p>
      <ResultsSummary report={report} />
      <TermCard term={report.terms[0]} />
      <TermCard term={report.terms[1]} />
      {report.otherResults.length > 0 && (
        <Card padding="none" className="rounded-2xl">
          <CardHeader title={t.otherResults} description={t.otherResultsHint} />
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
  const t = useText();
  const [years, setYears] = useState<MyChildAcademicYear[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedYearId, setSelectedYearId] = useState<string | null>(null);

  useEffect(() => {
    loadYears()
      .then((list) => {
        setYears(list);
        setSelectedYearId(list.find((y) => y.isCurrent)?.id ?? list[0]?.id ?? null);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : t.loadYearsFailed));
  }, [loadYears, t]);

  if (error) return <Alert tone="danger">{error}</Alert>;
  if (!years) return <SkeletonCards count={2} />;
  if (years.length === 0) {
    return (
      <Card className="rounded-2xl">
        <EmptyState icon={CalendarDays} title={t.noYear} description={t.noYearHint} />
      </Card>
    );
  }

  return (
    <>
      <Card className="rounded-2xl">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-foreground">{t.academicYear}</p>
            <p className="mt-0.5 text-sm text-foreground-soft">{t.chooseYear}</p>
          </div>
          <Select
            value={selectedYearId ?? ""}
            onChange={(e) => setSelectedYearId(e.target.value)}
            aria-label={t.academicYear}
            className="w-auto min-w-[180px]"
          >
            {years.map((y) => (
              <option key={y.id} value={y.id}>
                {y.name}
                {y.isCurrent ? t.current : ""}
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
  const t = useText();
  const [report, setReport] = useState<MyResultsReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadReport(academicYearId)
      .then(setReport)
      .catch((err) => setError(err instanceof ApiError ? err.message : t.loadResultsFailed));
  }, [academicYearId, loadReport, t]);

  if (error) return <Alert tone="danger">{error}</Alert>;
  if (!report) return <SkeletonCards count={2} />;
  return <ResultsReportView report={report} />;
}
