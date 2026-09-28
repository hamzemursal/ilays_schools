"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAuth, ApiError } from "@/lib/auth-context";
import { api, type MyExamRow, type ResultSubmissionStatus } from "@/lib/api";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Alert } from "@/components/ui/Alert";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input, Select } from "@/components/ui/FormControls";
import { SkeletonTable } from "@/components/ui/Skeleton";
import { Button } from "@/components/ui/Button";
import { ExamPaperStatusBadge, ResultsStatusBadge } from "@/features/exams/ExamStatusBadges";
import { Award, CalendarDays, CheckCircle2, ClipboardList, Hourglass, PenLine, RotateCcw, Search, Upload } from "lucide-react";

// A teacher's exams, grouped by the class·section they teach, so a teacher
// with several classes always sees one class at a time instead of one long
// mixed list. Pure presentation: the rows, links and actions are exactly the
// ones the page always had (api.listMyExams).

type StatusFilter = "ALL" | "TODO" | "REVIEW" | "PUBLISHED";

// Where each result status sits for the teacher: something to do, waiting on
// the admin, or finished.
const STATUS_GROUP: Record<ResultSubmissionStatus, Exclude<StatusFilter, "ALL">> = {
  DRAFT: "TODO",
  NEEDS_CORRECTION: "TODO",
  SUBMITTED: "REVIEW",
  APPROVED: "REVIEW",
  PUBLISHED: "PUBLISHED",
};

// One color per class·section, in the order they are listed — a category
// color only (never a status).
const CLASS_TONES = [
  { bar: "bg-accent", soft: "bg-accent-soft", text: "text-accent", ring: "ring-accent/30", border: "border-accent/40" },
  { bar: "bg-violet-500", soft: "bg-violet-50", text: "text-violet-700", ring: "ring-violet-300", border: "border-violet-300" },
  { bar: "bg-teal-500", soft: "bg-teal-50", text: "text-teal-700", ring: "ring-teal-300", border: "border-teal-300" },
  { bar: "bg-amber-500", soft: "bg-amber-50", text: "text-amber-700", ring: "ring-amber-300", border: "border-amber-300" },
  { bar: "bg-rose-500", soft: "bg-rose-50", text: "text-rose-700", ring: "ring-rose-300", border: "border-rose-300" },
  { bar: "bg-emerald-500", soft: "bg-emerald-50", text: "text-emerald-700", ring: "ring-emerald-300", border: "border-emerald-300" },
] as const;

const classKey = (r: Pick<MyExamRow, "classId" | "sectionId">) => `${r.classId}|${r.sectionId}`;

export default function MyExamsPage() {
  const { accessToken } = useAuth();
  const [rows, setRows] = useState<MyExamRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [academicYearId, setAcademicYearId] = useState("");
  const [examId, setExamId] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [classSection, setClassSection] = useState("");
  const [status, setStatus] = useState<StatusFilter>("ALL");
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!accessToken) return;
    api
      .listMyExams(accessToken)
      .then(setRows)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load your exams"));
  }, [accessToken]);

  const years = useMemo(() => uniqueBy(rows ?? [], (r) => r.academicYearId, (r) => r.academicYearName), [rows]);
  const exams = useMemo(() => uniqueBy(rows ?? [], (r) => r.examId, (r) => r.examName), [rows]);
  const subjects = useMemo(() => uniqueBy(rows ?? [], (r) => r.subjectId, (r) => r.subjectName), [rows]);

  // Every class·section this teacher has exams in, sorted, each with a stable color.
  const classSections = useMemo(() => {
    const map = new Map<string, { key: string; label: string }>();
    for (const r of rows ?? []) map.set(classKey(r), { key: classKey(r), label: `${r.className} · ${r.sectionName}` });
    return [...map.values()]
      .sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }))
      .map((c, i) => ({ ...c, tone: CLASS_TONES[i % CLASS_TONES.length] }));
  }, [rows]);
  const toneOf = (key: string) => classSections.find((c) => c.key === key)?.tone ?? CLASS_TONES[0];

  // Everything except the status and class choices — so their counts stay
  // meaningful while the teacher switches between them.
  const base = (rows ?? []).filter((r) => {
    const q = search.trim().toLowerCase();
    return (
      (!academicYearId || r.academicYearId === academicYearId) &&
      (!examId || r.examId === examId) &&
      (!subjectId || r.subjectId === subjectId) &&
      (!q || `${r.examName} ${r.subjectName} ${r.className} ${r.sectionName}`.toLowerCase().includes(q))
    );
  });
  const inStatus = base.filter((r) => status === "ALL" || STATUS_GROUP[r.resultsStatus] === status);
  const filtered = inStatus
    .filter((r) => !classSection || classKey(r) === classSection)
    .sort((a, b) => (b.examDate ?? "").localeCompare(a.examDate ?? ""));

  const byClass = classSections
    .map((c) => ({ ...c, rows: filtered.filter((r) => classKey(r) === c.key) }))
    .filter((g) => g.rows.length > 0);

  const counts = {
    ALL: base.length,
    TODO: base.filter((r) => STATUS_GROUP[r.resultsStatus] === "TODO").length,
    REVIEW: base.filter((r) => STATUS_GROUP[r.resultsStatus] === "REVIEW").length,
    PUBLISHED: base.filter((r) => STATUS_GROUP[r.resultsStatus] === "PUBLISHED").length,
  };
  const hasFilters = !!(academicYearId || examId || subjectId || classSection || search || status !== "ALL");

  function reset() {
    setAcademicYearId("");
    setExamId("");
    setSubjectId("");
    setClassSection("");
    setStatus("ALL");
    setSearch("");
  }

  return (
    <div>
      <PageHeader
        variant="plain"
        eyebrow="Exams & Results"
        title="My Exams"
        description="Manage your exam papers and student results"
        breadcrumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "My Exams" }]}
      />

      <div className="space-y-5 px-3 pb-8 pt-4 sm:px-5">
        {error ? (
          <Alert tone="danger">{error}</Alert>
        ) : !rows ? (
          <SkeletonTable rows={5} cols={5} />
        ) : rows.length === 0 ? (
          <Card className="rounded-2xl">
            <EmptyState icon={Award} title="No exams assigned yet" description="Your School Admin hasn't scheduled an exam for your classes yet." />
          </Card>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" role="group" aria-label="Filter by results status">
              <StatusTile icon={ClipboardList} label="All exams" value={counts.ALL} tone="blue" active={status === "ALL"} onClick={() => setStatus("ALL")} />
              <StatusTile icon={PenLine} label="Need results" value={counts.TODO} tone="amber" active={status === "TODO"} onClick={() => setStatus("TODO")} />
              <StatusTile icon={Hourglass} label="In review" value={counts.REVIEW} tone="violet" active={status === "REVIEW"} onClick={() => setStatus("REVIEW")} />
              <StatusTile
                icon={CheckCircle2}
                label="Published"
                value={counts.PUBLISHED}
                tone="green"
                active={status === "PUBLISHED"}
                onClick={() => setStatus("PUBLISHED")}
              />
            </div>

            <div className="space-y-4 rounded-2xl border border-border bg-background p-4 shadow-sm sm:p-5">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1fr]">
                <div>
                  <label htmlFor="my-exams-search" className="mb-1 block text-xs font-medium text-foreground-muted">
                    Search
                  </label>
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-foreground-muted" />
                    <Input
                      id="my-exams-search"
                      type="search"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Exam, subject or class…"
                      className="pl-9"
                    />
                  </div>
                </div>
                <FilterSelect label="Academic Year" value={academicYearId} onChange={setAcademicYearId} options={years} />
                <FilterSelect label="Exam" value={examId} onChange={setExamId} options={exams} />
                <FilterSelect label="Subject" value={subjectId} onChange={setSubjectId} options={subjects} />
              </div>

              <div>
                <p className="mb-2 text-xs font-medium text-foreground-muted">My classes</p>
                <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by class">
                  <ClassChip label="All classes" count={inStatus.length} active={!classSection} onClick={() => setClassSection("")} />
                  {classSections.map((c) => (
                    <ClassChip
                      key={c.key}
                      label={c.label}
                      count={inStatus.filter((r) => classKey(r) === c.key).length}
                      active={classSection === c.key}
                      tone={c.tone}
                      onClick={() => setClassSection(classSection === c.key ? "" : c.key)}
                    />
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between gap-3 border-t border-border pt-3">
                <p className="text-sm text-foreground-soft" aria-live="polite">
                  {filtered.length} of {rows.length} exam(s)
                </p>
                {hasFilters && (
                  <Button size="sm" variant="ghost" icon={<RotateCcw className="size-4" />} onClick={reset}>
                    Clear filters
                  </Button>
                )}
              </div>
            </div>

            {byClass.length === 0 ? (
              <Card className="rounded-2xl">
                <EmptyState title="No matches" description="Try clearing a filter." />
              </Card>
            ) : (
              byClass.map((group) => (
                <section
                  key={group.key}
                  aria-label={group.label}
                  className="overflow-hidden rounded-2xl border border-border bg-background shadow-sm"
                >
                  <div className="flex items-center gap-3 border-b border-border px-5 py-3.5">
                    <span className={`h-9 w-1.5 shrink-0 rounded-full ${group.tone.bar}`} aria-hidden />
                    <div className="min-w-0 flex-1">
                      <h2 className="text-base font-semibold text-foreground">{group.label}</h2>
                      <p className="text-xs text-foreground-muted">
                        {group.rows.length} exam{group.rows.length === 1 ? "" : "s"} ·{" "}
                        {[...new Set(group.rows.map((r) => r.subjectName))].join(", ")}
                      </p>
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[860px] text-left text-sm">
                      <thead className="bg-surface-soft text-xs font-semibold uppercase tracking-wide text-foreground-muted">
                        <tr>
                          <th className="px-5 py-2.5">Exam</th>
                          <th className="px-4 py-2.5">Subject</th>
                          <th className="px-4 py-2.5">Exam Date</th>
                          <th className="px-4 py-2.5">Paper</th>
                          <th className="px-4 py-2.5">Results</th>
                          <th className="px-5 py-2.5 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {group.rows.map((r) => (
                          <tr key={r.examSubjectId + r.sectionId} className="transition-colors hover:bg-surface-soft">
                            <td className="px-5 py-3">
                              <p className="font-medium text-foreground">{r.examName}</p>
                              <p className="text-xs text-foreground-muted">{r.academicYearName}</p>
                            </td>
                            <td className="px-4 py-3">
                              <span className={`inline-flex rounded-md px-2 py-0.5 text-xs font-semibold ${toneOf(group.key).soft} ${toneOf(group.key).text}`}>
                                {r.subjectName}
                              </span>
                            </td>
                            <td className="whitespace-nowrap px-4 py-3 text-foreground-soft">
                              <span className="inline-flex items-center gap-1.5">
                                <CalendarDays className="size-3.5 text-foreground-muted" />
                                {r.examDate ? new Date(r.examDate).toLocaleDateString() : "—"}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <ExamPaperStatusBadge status={r.paperStatus} />
                            </td>
                            <td className="px-4 py-3">
                              <ResultsStatusBadge status={r.resultsStatus} />
                            </td>
                            <td className="px-5 py-3">
                              <div className="flex flex-wrap justify-end gap-1.5">
                                <Link href={`/my-exams/${r.examSubjectId}/sections/${r.sectionId}/paper`}>
                                  <Button size="sm" variant="outline" icon={<Upload className="size-3.5" />}>
                                    {r.paperStatus ? "Replace Paper" : "Upload Paper"}
                                  </Button>
                                </Link>
                                <Link href={`/schools/${r.schoolId}/exam-subjects/${r.examSubjectId}/sections/${r.sectionId}/results`}>
                                  <Button
                                    size="sm"
                                    variant={STATUS_GROUP[r.resultsStatus] === "TODO" ? "primary" : "outline"}
                                    icon={<PenLine className="size-3.5" />}
                                  >
                                    {r.resultsStatus === "DRAFT" ? "Enter Results" : "View Results"}
                                  </Button>
                                </Link>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              ))
            )}
          </>
        )}
      </div>
    </div>
  );
}

const TILE_TONE = {
  blue: "bg-accent-soft text-accent",
  amber: "bg-amber-50 text-amber-600",
  violet: "bg-violet-50 text-violet-600",
  green: "bg-success-soft text-success",
} as const;

function StatusTile({
  icon: Icon,
  label,
  value,
  tone,
  active,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  tone: keyof typeof TILE_TONE;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex items-center gap-3 rounded-2xl border bg-background p-4 text-left shadow-sm transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 sm:p-5 ${
        active ? "border-accent ring-1 ring-accent/30" : "border-border hover:-translate-y-0.5 hover:shadow-md"
      }`}
    >
      <span className={`flex size-11 shrink-0 items-center justify-center rounded-xl ${TILE_TONE[tone]}`}>
        <Icon className="size-5" />
      </span>
      <span className="min-w-0">
        <span className="block text-2xl font-bold leading-none tabular-nums text-foreground">{value}</span>
        <span className="mt-1 block truncate text-sm text-foreground-soft">{label}</span>
      </span>
    </button>
  );
}

function ClassChip({
  label,
  count,
  active,
  tone,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  tone?: (typeof CLASS_TONES)[number];
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 ${
        active
          ? tone
            ? `${tone.soft} ${tone.text} ${tone.border} ring-1 ${tone.ring}`
            : "border-accent bg-accent text-white"
          : "border-border bg-background text-foreground-soft hover:border-accent/40 hover:text-foreground"
      }`}
    >
      {tone && <span className={`size-2 rounded-full ${tone.bar}`} aria-hidden />}
      {label}
      <span className={`rounded-full px-1.5 text-xs tabular-nums ${active && !tone ? "bg-white/20" : "bg-surface"}`}>{count}</span>
    </button>
  );
}

function uniqueBy<T>(rows: T[], keyOf: (r: T) => string, labelOf: (r: T) => string) {
  const map = new Map<string, string>();
  for (const r of rows) map.set(keyOf(r), labelOf(r));
  return Array.from(map.entries()).map(([value, label]) => ({ value, label }));
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  const id = `my-exams-${label.toLowerCase().replace(/\s+/g, "-")}`;
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-xs font-medium text-foreground-muted">
        {label}
      </label>
      <Select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">All</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </Select>
    </div>
  );
}
