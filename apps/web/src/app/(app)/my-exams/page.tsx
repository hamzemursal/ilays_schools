"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAuth, ApiError } from "@/lib/auth-context";
import { api, type MyExamRow } from "@/lib/api";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardHeader } from "@/components/ui/Card";
import { Alert } from "@/components/ui/Alert";
import { EmptyState } from "@/components/ui/EmptyState";
import { Select } from "@/components/ui/FormControls";
import { SkeletonTable } from "@/components/ui/Skeleton";
import { Button } from "@/components/ui/Button";
import { ExamPaperStatusBadge, ResultsStatusBadge } from "@/features/exams/ExamStatusBadges";
import { Award, Upload, PenLine } from "lucide-react";

export default function MyExamsPage() {
  const { accessToken } = useAuth();
  const [rows, setRows] = useState<MyExamRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [academicYearId, setAcademicYearId] = useState("");
  const [examId, setExamId] = useState("");
  const [classId, setClassId] = useState("");
  const [sectionId, setSectionId] = useState("");
  const [subjectId, setSubjectId] = useState("");

  useEffect(() => {
    if (!accessToken) return;
    api
      .listMyExams(accessToken)
      .then(setRows)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load your exams"));
  }, [accessToken]);

  const years = useMemo(() => uniqueBy(rows ?? [], (r) => r.academicYearId, (r) => r.academicYearName), [rows]);
  const exams = useMemo(() => uniqueBy(rows ?? [], (r) => r.examId, (r) => r.examName), [rows]);
  const classes = useMemo(() => uniqueBy(rows ?? [], (r) => r.classId, (r) => r.className), [rows]);
  const sections = useMemo(() => uniqueBy(rows ?? [], (r) => r.sectionId, (r) => r.sectionName), [rows]);
  const subjects = useMemo(() => uniqueBy(rows ?? [], (r) => r.subjectId, (r) => r.subjectName), [rows]);

  const filtered = (rows ?? []).filter(
    (r) =>
      (!academicYearId || r.academicYearId === academicYearId) &&
      (!examId || r.examId === examId) &&
      (!classId || r.classId === classId) &&
      (!sectionId || r.sectionId === sectionId) &&
      (!subjectId || r.subjectId === subjectId),
  );

  return (
    <div>
      <PageHeader
        eyebrow="Exams & Results"
        title="My Exams"
        description="Manage your exam papers and student results"
        breadcrumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "My Exams" }]}
      />

      <div className="space-y-5 p-4 sm:p-6">
        {error ? (
          <Alert tone="danger">{error}</Alert>
        ) : !rows ? (
          <SkeletonTable rows={5} cols={5} />
        ) : rows.length === 0 ? (
          <Card>
            <EmptyState icon={Award} title="No exams assigned yet" description="Your School Admin hasn't scheduled an exam for your classes yet." />
          </Card>
        ) : (
          <>
            <Card>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                <FilterSelect label="Academic Year" value={academicYearId} onChange={setAcademicYearId} options={years} />
                <FilterSelect label="Exam" value={examId} onChange={setExamId} options={exams} />
                <FilterSelect label="Class" value={classId} onChange={setClassId} options={classes} />
                <FilterSelect label="Section" value={sectionId} onChange={setSectionId} options={sections} />
                <FilterSelect label="Subject" value={subjectId} onChange={setSubjectId} options={subjects} />
              </div>
            </Card>

            <Card padding="none">
              <CardHeader title="Exams" description={`${filtered.length} of ${rows.length} exam(s).`} />
              {filtered.length === 0 ? (
                <div className="p-5">
                  <EmptyState title="No matches" description="Try clearing a filter." />
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[900px] text-left text-sm">
                    <thead className="bg-surface-soft text-xs font-semibold uppercase tracking-wide text-foreground-muted">
                      <tr>
                        <th className="px-5 py-2.5">Exam</th>
                        <th className="px-5 py-2.5">Class / Section</th>
                        <th className="px-5 py-2.5">Subject</th>
                        <th className="px-5 py-2.5">Exam Date</th>
                        <th className="px-5 py-2.5">Paper</th>
                        <th className="px-5 py-2.5">Results</th>
                        <th className="px-5 py-2.5">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {filtered.map((r) => (
                        <tr key={r.examSubjectId + r.sectionId}>
                          <td className="px-5 py-3 text-foreground">
                            {r.examName}
                            <div className="text-xs text-foreground-muted">{r.academicYearName}</div>
                          </td>
                          <td className="px-5 py-3 text-foreground-soft">
                            {r.className} · {r.sectionName}
                          </td>
                          <td className="px-5 py-3 text-foreground-soft">{r.subjectName}</td>
                          <td className="px-5 py-3 text-foreground-muted">
                            {r.examDate ? new Date(r.examDate).toLocaleDateString() : "—"}
                          </td>
                          <td className="px-5 py-3">
                            <ExamPaperStatusBadge status={r.paperStatus} />
                          </td>
                          <td className="px-5 py-3">
                            <ResultsStatusBadge status={r.resultsStatus} />
                          </td>
                          <td className="px-5 py-3">
                            <div className="flex flex-wrap gap-1.5">
                              <Link href={`/my-exams/${r.examSubjectId}/sections/${r.sectionId}/paper`}>
                                <Button size="sm" variant="outline" icon={<Upload className="size-3.5" />}>
                                  {r.paperStatus ? "Replace Paper" : "Upload Paper"}
                                </Button>
                              </Link>
                              <Link
                                href={`/schools/${r.schoolId}/exam-subjects/${r.examSubjectId}/sections/${r.sectionId}/results`}
                              >
                                <Button size="sm" variant="outline" icon={<PenLine className="size-3.5" />}>
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
              )}
            </Card>
          </>
        )}
      </div>
    </div>
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
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-foreground-muted">{label}</label>
      <Select value={value} onChange={(e) => onChange(e.target.value)}>
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
