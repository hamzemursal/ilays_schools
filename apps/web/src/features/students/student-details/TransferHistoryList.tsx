import { ArrowDown, ArrowLeftRight } from "lucide-react";
import type { StudentTransferRecord, StudentTransferSnapshot } from "@/lib/api";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";

// Real Transfer records only (StudentsService.getFullDetail) — a transfer
// changes school/class/section/academic year, never the student's own
// permanent id. toEnrollment is null until the destination school accepts.
const STATUS_TONE: Record<StudentTransferRecord["status"], "success" | "danger" | "accent" | "warning"> = {
  EXECUTED: "success",
  REJECTED: "danger",
  CANCELLED: "danger",
  APPROVED: "accent",
  REQUESTED: "warning",
};

export function TransferHistoryList({ transfers }: { transfers: StudentTransferRecord[] }) {
  if (transfers.length === 0) {
    return (
      <Card>
        <EmptyState icon={ArrowLeftRight} title="No transfers recorded" description="This student has never been transferred between schools." />
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {transfers.map((t) => (
        <Card key={t.id}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <p className="text-xs text-foreground-muted">
              {new Date(t.transferDate ?? t.createdAt).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" })}
            </p>
            <Badge tone={STATUS_TONE[t.status]}>{t.status}</Badge>
          </div>

          <div className="mt-3 grid grid-cols-1 items-center gap-3 sm:grid-cols-[1fr_auto_1fr]">
            <TransferSide label="FROM" snapshot={t.fromEnrollment} />
            <div className="flex justify-center">
              <ArrowDown className="size-5 text-foreground-muted sm:-rotate-90" />
            </div>
            {t.toEnrollment ? (
              <TransferSide label="TO" snapshot={t.toEnrollment} />
            ) : (
              <div className="rounded-lg border border-dashed border-border p-3 text-center text-sm text-foreground-muted">
                destination pending
              </div>
            )}
          </div>

          {t.reason && <p className="mt-3 text-sm text-foreground-soft">{t.reason}</p>}
        </Card>
      ))}
    </div>
  );
}

function TransferSide({ label, snapshot }: { label: string; snapshot: StudentTransferSnapshot }) {
  return (
    <div className="rounded-lg border border-border bg-surface-soft p-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-foreground-muted">{label}</p>
      <p className="mt-1 text-sm font-semibold text-foreground">{snapshot.school.name}</p>
      <p className="mt-0.5 text-sm text-foreground-soft">
        {snapshot.class.name} — Section {snapshot.section.name}
      </p>
      <p className="mt-0.5 text-xs text-foreground-muted">{snapshot.academicYear.name}</p>
    </div>
  );
}
