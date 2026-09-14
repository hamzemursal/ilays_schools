import type { FeeStatus } from "@/lib/api";
import { Badge } from "@/components/ui/Badge";

const TONE: Record<FeeStatus, "success" | "warning" | "danger" | "neutral"> = {
  PAID: "success",
  PARTIALLY_PAID: "warning",
  PENDING: "warning",
  OVERDUE: "danger",
  NO_CHARGE: "neutral",
};
const LABEL: Record<FeeStatus, string> = {
  PAID: "Paid",
  PARTIALLY_PAID: "Partially Paid",
  PENDING: "Pending",
  OVERDUE: "Overdue",
  NO_CHARGE: "No Charge",
};

export function FeeStatusBadge({ status }: { status: FeeStatus }) {
  return <Badge tone={TONE[status]}>{LABEL[status]}</Badge>;
}
