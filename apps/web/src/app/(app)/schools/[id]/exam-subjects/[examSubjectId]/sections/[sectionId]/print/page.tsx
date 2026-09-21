"use client";

import { use, useEffect, useState } from "react";
import { useAuth, ApiError } from "@/lib/auth-context";
import { api, type ResultsForSection } from "@/lib/api";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { SkeletonCards } from "@/components/ui/Skeleton";
import { Printer } from "lucide-react";

const TOGGLEABLE_COLUMNS = [
  { key: "studentId", label: "Student ID" },
  { key: "rollNumber", label: "Roll No." },
  { key: "mark", label: "Mark" },
  { key: "percentage", label: "Percentage" },
] as const;
type ToggleableColumn = (typeof TOGGLEABLE_COLUMNS)[number]["key"];

export default function PrintResultSheetPage({
  params,
}: {
  params: Promise<{ id: string; examSubjectId: string; sectionId: string }>;
}) {
  const { id: schoolId, examSubjectId, sectionId } = use(params);
  const { accessToken } = useAuth();

  const [data, setData] = useState<ResultsForSection | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [visibleColumns, setVisibleColumns] = useState<Record<ToggleableColumn, boolean>>({
    studentId: true,
    rollNumber: true,
    mark: true,
    percentage: true,
  });

  function toggleColumn(key: ToggleableColumn) {
    setVisibleColumns((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  useEffect(() => {
    if (!accessToken) return;
    api
      .getResults(accessToken, schoolId, examSubjectId, sectionId)
      .then(setData)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load the result sheet"));
  }, [accessToken, schoolId, examSubjectId, sectionId]);

  if (error) {
    return (
      <div className="p-6">
        <Alert tone="danger">{error}</Alert>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-6">
        <SkeletonCards count={2} />
      </div>
    );
  }

  const { context } = data;

  return (
    <div className="mx-auto max-w-3xl p-4 sm:p-6 print:max-w-none print:p-0">
      <Card className="mb-4 print:hidden">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-4">
            <span className="text-sm font-medium text-foreground-soft">Columns to include:</span>
            {TOGGLEABLE_COLUMNS.map((col) => (
              <label key={col.key} className="flex items-center gap-1.5 text-sm text-foreground">
                <input
                  type="checkbox"
                  checked={visibleColumns[col.key]}
                  onChange={() => toggleColumn(col.key)}
                  className="size-4 rounded border-border accent-accent"
                />
                {col.label}
              </label>
            ))}
          </div>
          <Button icon={<Printer className="size-4" />} onClick={() => window.print()}>
            Print / Save as PDF
          </Button>
        </div>
      </Card>

      <div className="rounded-xl border border-border bg-background p-8 print:rounded-none print:border-none print:p-0">
        <div className="flex items-center gap-4 border-b border-border pb-4">
          {context.schoolLogoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={context.schoolLogoUrl} alt="" className="size-14 shrink-0 rounded-lg object-cover print:size-12" />
          )}
          <div>
            <p className="text-lg font-semibold text-foreground">{context.schoolName}</p>
            <p className="text-sm text-foreground-soft">Class Result Sheet</p>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm sm:grid-cols-3">
          <Field label="Exam" value={`${context.examName} (${context.examType})`} />
          <Field label="Academic Year" value={context.academicYearName} />
          <Field label="Class" value={context.className} />
          <Field label="Section" value={context.sectionName} />
          <Field label="Subject" value={context.subjectName} />
          <Field label="Exam Date" value={context.examDate ? new Date(context.examDate).toLocaleDateString() : "—"} />
        </div>

        <div className="mt-6 overflow-x-auto">
          <table className="w-full min-w-[560px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b-2 border-foreground/20 text-xs font-semibold uppercase tracking-wide text-foreground-muted">
                <th className="py-2 pr-3">No.</th>
                <th className="py-2 pr-3">Student Name</th>
                {visibleColumns.studentId && <th className="py-2 pr-3">Student ID</th>}
                {visibleColumns.rollNumber && <th className="py-2 pr-3">Roll No.</th>}
                {visibleColumns.mark && <th className="py-2 pr-3 text-right">Mark</th>}
                {visibleColumns.percentage && <th className="py-2 pr-3 text-right">Percentage</th>}
              </tr>
            </thead>
            <tbody>
              {data.students.map((s, i) => (
                <tr key={s.enrollmentId} className="border-b border-border">
                  <td className="py-2 pr-3 text-foreground-muted">{i + 1}</td>
                  <td className="py-2 pr-3 text-foreground">
                    {s.firstName} {s.lastName}
                  </td>
                  {visibleColumns.studentId && <td className="py-2 pr-3 font-mono text-xs text-foreground-soft">{s.studentNumber}</td>}
                  {visibleColumns.rollNumber && <td className="py-2 pr-3 text-foreground-soft">{s.rollNumber}</td>}
                  {visibleColumns.mark && (
                    <td className="py-2 pr-3 text-right text-foreground">
                      {s.isAbsent ? "Absent" : `${s.marksObtained ?? "—"} / ${data.maxMarks}`}
                    </td>
                  )}
                  {visibleColumns.percentage && (
                    <td className="py-2 pr-3 text-right text-foreground">{s.percentage !== null ? `${s.percentage}%` : "—"}</td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-6 flex flex-wrap gap-x-8 gap-y-1 border-t border-border pt-4 text-sm">
          <span className="text-foreground-soft">
            Average <span className="font-medium text-foreground">{data.average ?? "—"}</span>
          </span>
          <span className="text-foreground-soft">
            Highest <span className="font-medium text-foreground">{data.highest ?? "—"}</span>
          </span>
          <span className="text-foreground-soft">
            Lowest <span className="font-medium text-foreground">{data.lowest ?? "—"}</span>
          </span>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-1.5">
      <span className="font-medium text-foreground-muted">{label}:</span>
      <span className="text-foreground">{value}</span>
    </div>
  );
}
