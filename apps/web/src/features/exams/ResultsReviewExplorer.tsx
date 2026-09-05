"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth, ApiError } from "@/lib/auth-context";
import { api, type AcademicYear, type ResultSubmissionListRow, type ResultSubmissionStatus, type School } from "@/lib/api";
import { PageHeader, type Crumb } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Alert } from "@/components/ui/Alert";
import { Select } from "@/components/ui/FormControls";
import { EmptyState } from "@/components/ui/EmptyState";
import { SkeletonTable } from "@/components/ui/Skeleton";
import { ResultsStatusBadge } from "./ExamStatusBadges";
import { ClipboardCheck } from "lucide-react";

const STATUS_OPTIONS: ResultSubmissionStatus[] = ["DRAFT", "SUBMITTED", "NEEDS_CORRECTION", "APPROVED", "PUBLISHED"];

export function ResultsReviewExplorer({
  fixedSchoolId,
  pageTitle,
  breadcrumbs,
}: {
  fixedSchoolId?: string;
  pageTitle: string;
  breadcrumbs?: Crumb[];
}) {
  const { accessToken } = useAuth();
  const isOrgWide = !fixedSchoolId;

  const [schools, setSchools] = useState<School[]>([]);
  const [selectedSchoolId, setSelectedSchoolId] = useState("");
  const effectiveSchoolId = fixedSchoolId || selectedSchoolId || undefined;

  const [academicYears, setAcademicYears] = useState<AcademicYear[]>([]);
  const [academicYearId, setAcademicYearId] = useState("");
  const [status, setStatus] = useState<ResultSubmissionStatus | "">("SUBMITTED");

  const [rows, setRows] = useState<ResultSubmissionListRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken || !isOrgWide) return;
    api.listSchools(accessToken).then(setSchools).catch(() => setSchools([]));
  }, [accessToken, isOrgWide]);

  const [prevSchoolId, setPrevSchoolId] = useState(effectiveSchoolId);
  if (effectiveSchoolId !== prevSchoolId) {
    setPrevSchoolId(effectiveSchoolId);
    if (!effectiveSchoolId) {
      setAcademicYears([]);
      setAcademicYearId("");
    }
  }

  useEffect(() => {
    if (!accessToken || !effectiveSchoolId) return;
    api.listAcademicYears(accessToken, effectiveSchoolId).then(setAcademicYears).catch(() => setAcademicYears([]));
  }, [accessToken, effectiveSchoolId]);

  const filterKey = JSON.stringify({ effectiveSchoolId, academicYearId, status });
  const [prevFilterKey, setPrevFilterKey] = useState(filterKey);
  if (filterKey !== prevFilterKey) {
    setPrevFilterKey(filterKey);
    setLoading(true);
    setError(null);
  }

  useEffect(() => {
    if (!accessToken) return;
    api
      .listResultSubmissions(accessToken, { schoolId: effectiveSchoolId, academicYearId: academicYearId || undefined, status: status || undefined })
      .then(setRows)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load results"))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken, filterKey]);

  return (
    <div>
      <PageHeader eyebrow="Exams & Results" title={pageTitle} description="Review, return, or approve submitted results." breadcrumbs={breadcrumbs} />

      <div className="space-y-5 p-4 sm:p-6">
        {error && <Alert tone="danger">{error}</Alert>}

        <Card>
          <div className={`grid gap-3 sm:grid-cols-2 ${isOrgWide ? "lg:grid-cols-3" : "lg:grid-cols-2"}`}>
            {isOrgWide && (
              <div>
                <label className="mb-1 block text-xs font-medium text-foreground-muted">School</label>
                <Select value={selectedSchoolId} onChange={(e) => setSelectedSchoolId(e.target.value)}>
                  <option value="">All schools</option>
                  {schools.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </Select>
              </div>
            )}
            <div>
              <label className="mb-1 block text-xs font-medium text-foreground-muted">Academic Year</label>
              <Select value={academicYearId} onChange={(e) => setAcademicYearId(e.target.value)} disabled={!effectiveSchoolId}>
                <option value="">All years</option>
                {academicYears.map((y) => (
                  <option key={y.id} value={y.id}>
                    {y.name}
                    {y.isCurrent ? " (current)" : ""}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-foreground-muted">Status</label>
              <Select value={status} onChange={(e) => setStatus(e.target.value as ResultSubmissionStatus | "")}>
                <option value="">All statuses</option>
                {STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {s.replace("_", " ")}
                  </option>
                ))}
              </Select>
            </div>
          </div>
        </Card>

        <Card padding="none">
          {loading ? (
            <div className="p-5">
              <SkeletonTable rows={5} cols={7} />
            </div>
          ) : !rows || rows.length === 0 ? (
            <div className="p-5">
              <EmptyState icon={ClipboardCheck} title="No results waiting for review" description="Try widening your filters." />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1000px] text-left text-sm">
                <thead className="bg-surface-soft text-xs font-semibold uppercase tracking-wide text-foreground-muted">
                  <tr>
                    <th className="px-5 py-2.5">Exam</th>
                    {isOrgWide && <th className="px-5 py-2.5">School</th>}
                    <th className="px-5 py-2.5">Class / Section</th>
                    <th className="px-5 py-2.5">Subject</th>
                    <th className="px-5 py-2.5">Teacher</th>
                    <th className="px-5 py-2.5">Completed</th>
                    <th className="px-5 py-2.5">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {rows.map((r) => (
                    <tr key={r.resultSubmissionId} className="cursor-pointer hover:bg-surface-hover">
                      <td className="px-5 py-3 text-foreground">
                        <Link href={`/schools/${r.schoolId}/exam-subjects/${r.examSubjectId}/sections/${r.sectionId}/results`} className="block">
                          {r.examName}
                          <div className="text-xs text-foreground-muted">{r.academicYearName}</div>
                        </Link>
                      </td>
                      {isOrgWide && <td className="px-5 py-3 text-foreground-soft">{r.schoolName}</td>}
                      <td className="px-5 py-3 text-foreground-soft">
                        {r.className} · {r.sectionName}
                      </td>
                      <td className="px-5 py-3 text-foreground-soft">{r.subjectName}</td>
                      <td className="px-5 py-3 text-foreground-soft">{r.teacherName ?? "—"}</td>
                      <td className="px-5 py-3 text-foreground-muted">
                        {r.completedCount} / {r.studentCount}
                      </td>
                      <td className="px-5 py-3">
                        <ResultsStatusBadge status={r.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
