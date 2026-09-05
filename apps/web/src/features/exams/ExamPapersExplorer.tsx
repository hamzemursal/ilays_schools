"use client";

import { useEffect, useState } from "react";
import { useAuth, ApiError } from "@/lib/auth-context";
import { api, type AcademicYear, type ExamPaperListRow, type ExamPaperStatus, type School } from "@/lib/api";
import { PageHeader, type Crumb } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/FormControls";
import { EmptyState } from "@/components/ui/EmptyState";
import { SkeletonTable } from "@/components/ui/Skeleton";
import { ExamPaperStatusBadge } from "./ExamStatusBadges";
import { Download, FileText, Printer } from "lucide-react";

export function ExamPapersExplorer({
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
  const [status, setStatus] = useState<ExamPaperStatus | "">("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const [rows, setRows] = useState<ExamPaperListRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken || !isOrgWide) return;
    api.listSchools(accessToken).then(setSchools).catch(() => setSchools([]));
  }, [accessToken, isOrgWide]);

  // A new (or cleared) effective school invalidates the previous one's
  // academic year options — reset during render, same convention used
  // throughout this codebase (e.g. BulkTransferWizard), rather than inside
  // the effect below, which only ever calls setState from async callbacks.
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
    api
      .listAcademicYears(accessToken, effectiveSchoolId)
      .then(setAcademicYears)
      .catch(() => setAcademicYears([]));
  }, [accessToken, effectiveSchoolId]);

  // Reset loading/error the moment any filter changes, during render (React's
  // own recommended pattern for "adjust state when a value changes") rather
  // than synchronously inside the effect below, which only ever calls
  // setState from its async .then()/.catch()/.finally() callbacks.
  const filterKey = JSON.stringify({ effectiveSchoolId, academicYearId, status, dateFrom, dateTo });
  const [prevFilterKey, setPrevFilterKey] = useState(filterKey);
  if (filterKey !== prevFilterKey) {
    setPrevFilterKey(filterKey);
    setLoading(true);
    setError(null);
  }

  useEffect(() => {
    if (!accessToken) return;
    api
      .listExamPapers(accessToken, {
        schoolId: effectiveSchoolId,
        academicYearId: academicYearId || undefined,
        status: status || undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
      })
      .then(setRows)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load exam papers"))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken, filterKey]);

  return (
    <div>
      <PageHeader
        eyebrow="Exams & Results"
        title={pageTitle}
        description="View, download, and print submitted exam papers."
        breadcrumbs={breadcrumbs}
      />

      <div className="space-y-5 p-4 sm:p-6">
        {error && <Alert tone="danger">{error}</Alert>}

        <Card>
          <div className={`grid gap-3 sm:grid-cols-2 ${isOrgWide ? "lg:grid-cols-5" : "lg:grid-cols-4"}`}>
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
              <Select value={status} onChange={(e) => setStatus(e.target.value as ExamPaperStatus | "")}>
                <option value="">All statuses</option>
                <option value="DRAFT">Draft</option>
                <option value="SUBMITTED">Submitted</option>
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-foreground-muted">From</label>
              <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-foreground-muted">To</label>
              <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
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
              <EmptyState icon={FileText} title="No exam papers found" description="Try widening your filters, or check back once a teacher submits one." />
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
                    <th className="px-5 py-2.5">Exam Date</th>
                    <th className="px-5 py-2.5">Status</th>
                    <th className="px-5 py-2.5">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {rows.map((r) => (
                    <tr key={r.resultSubmissionId}>
                      <td className="px-5 py-3 text-foreground">
                        {r.examName}
                        <div className="text-xs text-foreground-muted">{r.academicYearName}</div>
                      </td>
                      {isOrgWide && <td className="px-5 py-3 text-foreground-soft">{r.schoolName}</td>}
                      <td className="px-5 py-3 text-foreground-soft">
                        {r.className} · {r.sectionName}
                      </td>
                      <td className="px-5 py-3 text-foreground-soft">{r.subjectName}</td>
                      <td className="px-5 py-3 text-foreground-soft">{r.teacherName ?? "—"}</td>
                      <td className="px-5 py-3 text-foreground-muted">{r.examDate ? new Date(r.examDate).toLocaleDateString() : "—"}</td>
                      <td className="px-5 py-3">
                        <ExamPaperStatusBadge status={r.paperStatus} />
                      </td>
                      <td className="px-5 py-3">
                        {r.file ? (
                          <div className="flex flex-wrap gap-1.5">
                            <a href={r.file.url} target="_blank" rel="noreferrer">
                              <Button size="sm" variant="outline" icon={<Download className="size-3.5" />}>
                                Download
                              </Button>
                            </a>
                            {r.file.mimeType === "application/pdf" && (
                              <a href={r.file.url} target="_blank" rel="noreferrer">
                                <Button size="sm" variant="outline" icon={<Printer className="size-3.5" />}>
                                  Print
                                </Button>
                              </a>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-foreground-muted">No file</span>
                        )}
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
