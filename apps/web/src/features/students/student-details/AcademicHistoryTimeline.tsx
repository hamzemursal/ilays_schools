"use client";

import Link from "next/link";
import { ArrowRight, Building2, GraduationCap, Hash, Layers } from "lucide-react";
import type { StudentEnrollmentRecord } from "@/lib/api";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";

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
  schoolId,
  studentId,
  canViewResults,
}: {
  enrollments: StudentEnrollmentRecord[];
  // The CURRENTLY browsed school (not necessarily the enrollment row's own
  // school — a transferred student's past enrollments can belong to a
  // DIFFERENT school) — this is only ever used to build the results page's
  // URL and its own "Back to Student Profile" link, never to decide which
  // results are visible. That isolation is enforced server-side, per the
  // requested academicYearId, regardless of which school this value names.
  schoolId: string;
  studentId: string;
  canViewResults: boolean;
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

            {/* Whether this specific year's results are actually published
                is only known once the dedicated results page loads them —
                querying that up front for every row here would mean one
                extra request per enrollment just to decide a button's
                label. The link is always offered; the results page itself
                is the only place that ever renders (or withholds) marks. */}
            {canViewResults && (
              <div className="mt-3 border-t border-border pt-3">
                <Link href={`/schools/${schoolId}/students/${studentId}/results/${e.academicYear.id}`}>
                  <Button size="sm" variant="outline" icon={<ArrowRight className="size-4" />}>
                    View Results
                  </Button>
                </Link>
              </div>
            )}
          </Card>
        </div>
      ))}
    </div>
  );
}
