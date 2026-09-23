"use client";

import { useState } from "react";
import { Building2, ChevronDown, ChevronUp, GraduationCap, Hash, Layers } from "lucide-react";
import { ApiError } from "@/lib/auth-context";
import type { MyResultsReport, StudentEnrollmentRecord } from "@/lib/api";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Alert } from "@/components/ui/Alert";
import { SkeletonCards } from "@/components/ui/Skeleton";
import { ResultsReportView } from "@/features/portal-results/PortalResults";

// Every real enrollment this student has ever had, one per academic year (a
// retained/promoted/transferred student gets a NEW row each year — see
// PromotionsService.confirm / TransfersService.approve) shown as its own
// historical record: this year's real class/section/roll/status, never the
// student's CURRENT class stamped onto an old year. Backend already orders
// these newest-first (StudentsService.getFullDetail).
const STATUS_TONE: Record<StudentEnrollmentRecord["status"], "success" | "accent" | "warning" | "neutral"> = {
  ACTIVE: "success",
  PROMOTED: "accent",
  RETAINED: "warning",
  TRANSFERRED_OUT: "neutral",
  COMPLETED: "accent",
  GRADUATED: "accent",
  WITHDRAWN: "neutral",
};

function formatStatus(status: string) {
  return status.replace(/_/g, " ");
}

export function AcademicHistoryTimeline({
  enrollments,
  studentId,
  accessToken,
  canViewResults,
  loadResultsReport,
}: {
  enrollments: StudentEnrollmentRecord[];
  studentId: string;
  accessToken: string | null;
  canViewResults: boolean;
  // Injected rather than reaching for studentsApi directly, so this
  // component (and its tests) never care whether the caller is an admin
  // viewing studentId or anyone else — the loader owns that scoping.
  loadResultsReport: (academicYearId: string) => Promise<MyResultsReport>;
}) {
  if (enrollments.length === 0) {
    return (
      <Card>
        <EmptyState icon={GraduationCap} title="No enrollment history yet" description="This student has no recorded enrollment." />
      </Card>
    );
  }

  return (
    <div data-testid="academic-history" role="list" aria-label="Academic history" className="space-y-3">
      {enrollments.map((e, i) => (
        <div key={e.id} role="listitem" className="relative pl-6">
          {/* A plain connecting line, not a real timeline library — purely
              decorative structure over real rows, never implying data that
              doesn't exist. */}
          {i < enrollments.length - 1 && (
            <span className="absolute top-6 left-[7px] -bottom-3 w-px bg-border" aria-hidden />
          )}
          <span
            className={`absolute top-6 left-0 size-3.5 rounded-full border-2 border-background ${
              i === 0 ? "bg-accent" : "bg-border"
            }`}
            aria-hidden
          />
          <Card>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-semibold text-foreground">{e.academicYear.name}</p>
                  <Badge tone={e.academicYear.isCurrent ? "accent" : "neutral"}>
                    {e.academicYear.isCurrent ? "Current Year" : "Previous Year"}
                  </Badge>
                </div>
                <p className="mt-1 flex items-center gap-1.5 text-sm text-foreground-soft">
                  <Building2 className="size-3.5 shrink-0 text-foreground-muted" />
                  {e.school.name}
                </p>
                <p className="mt-1 flex items-center gap-1.5 text-sm text-foreground-soft">
                  <Layers className="size-3.5 shrink-0 text-foreground-muted" />
                  {e.class.name} — Section {e.section.name}
                </p>
                <p className="mt-1 flex items-center gap-1.5 text-xs text-foreground-muted">
                  <Hash className="size-3 shrink-0" />
                  Roll No: {e.rollNumber} · Student No: {e.studentNumber}
                </p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1.5">
                <Badge tone={STATUS_TONE[e.status]}>{formatStatus(e.status)}</Badge>
                <p className="text-xs text-foreground-muted">
                  {new Date(e.startDate).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" })}
                  {e.endDate
                    ? ` – ${new Date(e.endDate).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" })}`
                    : " – present"}
                </p>
              </div>
            </div>

            {canViewResults && accessToken && (
              <ViewResultsSection
                key={`${e.id}-${studentId}`}
                academicYearId={e.academicYear.id}
                loadResultsReport={loadResultsReport}
              />
            )}
          </Card>
        </div>
      ))}
    </div>
  );
}

function ViewResultsSection({
  academicYearId,
  loadResultsReport,
}: {
  academicYearId: string;
  loadResultsReport: (academicYearId: string) => Promise<MyResultsReport>;
}) {
  const [open, setOpen] = useState(false);
  const [report, setReport] = useState<MyResultsReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function toggle() {
    if (open) {
      setOpen(false);
      return;
    }
    setOpen(true);
    if (report || loading) return;
    setLoading(true);
    setError(null);
    loadResultsReport(academicYearId)
      .then(setReport)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load results"))
      .finally(() => setLoading(false));
  }

  const isEmpty =
    !!report &&
    report.terms.every((t) => t.results.length === 0) &&
    report.otherResults.length === 0 &&
    report.annual.annualPercentage === null;

  return (
    <div className="mt-3 border-t border-border pt-3">
      <Button size="sm" variant="outline" icon={open ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />} onClick={toggle}>
        View Results
      </Button>
      {open && (
        <div className="mt-3 space-y-3">
          {loading && <SkeletonCards count={1} />}
          {error && <Alert tone="danger">{error}</Alert>}
          {report && isEmpty && (
            <EmptyState icon={GraduationCap} title="Results not published" description="No results have been published for this academic year yet." />
          )}
          {report && !isEmpty && <ResultsReportView report={report} />}
        </div>
      )}
    </div>
  );
}
