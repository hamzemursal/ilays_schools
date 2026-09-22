import { Building2, GraduationCap, Layers, Hash } from "lucide-react";
import type { StudentEnrollmentRecord } from "@/lib/api";
import { Badge } from "@/components/ui/Badge";
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

export function AcademicHistoryTimeline({ enrollments }: { enrollments: StudentEnrollmentRecord[] }) {
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
                <p className="text-sm font-semibold text-foreground">{e.academicYear.name}</p>
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
          </Card>
        </div>
      ))}
    </div>
  );
}
