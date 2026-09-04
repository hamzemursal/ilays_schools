import { Badge } from "@/components/ui/Badge";
import type { TransferStatus } from "@/lib/api";

// APPROVED is never actually assigned by the backend (see
// TransfersService — accept and complete are one step), kept here only so
// the type stays exhaustive if that ever changes.
const STATUS_LABEL: Record<TransferStatus, string> = {
  REQUESTED: "Pending",
  APPROVED: "Accepted",
  EXECUTED: "Completed",
  REJECTED: "Rejected",
  CANCELLED: "Cancelled",
};

const STATUS_TONE: Record<TransferStatus, "warning" | "success" | "danger" | "accent" | "neutral"> = {
  REQUESTED: "warning",
  APPROVED: "accent",
  EXECUTED: "success",
  REJECTED: "danger",
  CANCELLED: "neutral",
};

export function TransferStatusBadge({ status }: { status: TransferStatus }) {
  return <Badge tone={STATUS_TONE[status]}>{STATUS_LABEL[status]}</Badge>;
}

export function transferStatusLabel(status: TransferStatus): string {
  return STATUS_LABEL[status];
}
