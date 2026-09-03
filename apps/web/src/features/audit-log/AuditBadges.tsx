import { Badge } from "@/components/ui/Badge";
import type { AuditSeverity, AuditStatus } from "@/lib/api";

const STATUS_TONE: Record<AuditStatus, "success" | "danger" | "warning"> = {
  SUCCESS: "success",
  FAILED: "danger",
  DENIED: "warning",
};

const SEVERITY_TONE: Record<AuditSeverity, "neutral" | "warning" | "danger"> = {
  INFO: "neutral",
  WARNING: "warning",
  CRITICAL: "danger",
};

export function AuditStatusBadge({ status }: { status: AuditStatus }) {
  return <Badge tone={STATUS_TONE[status]}>{status}</Badge>;
}

export function AuditSeverityBadge({ severity }: { severity: AuditSeverity }) {
  return <Badge tone={SEVERITY_TONE[severity]}>{severity}</Badge>;
}
