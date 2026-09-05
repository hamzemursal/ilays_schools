import { Badge } from "@/components/ui/Badge";
import type { ExamPaperStatus, ResultSubmissionStatus } from "@/lib/api";

const PAPER_STATUS_LABEL: Record<ExamPaperStatus, string> = {
  DRAFT: "Draft",
  SUBMITTED: "Submitted",
};

const PAPER_STATUS_TONE: Record<ExamPaperStatus, "neutral" | "accent"> = {
  DRAFT: "neutral",
  SUBMITTED: "accent",
};

export function ExamPaperStatusBadge({ status }: { status: ExamPaperStatus | null }) {
  if (!status) return <Badge tone="neutral">No paper</Badge>;
  return <Badge tone={PAPER_STATUS_TONE[status]}>{PAPER_STATUS_LABEL[status]}</Badge>;
}

const RESULTS_STATUS_LABEL: Record<ResultSubmissionStatus, string> = {
  DRAFT: "Draft",
  SUBMITTED: "Pending Review",
  NEEDS_CORRECTION: "Needs Correction",
  APPROVED: "Approved",
  PUBLISHED: "Published",
};

const RESULTS_STATUS_TONE: Record<ResultSubmissionStatus, "neutral" | "accent" | "danger" | "success"> = {
  DRAFT: "neutral",
  SUBMITTED: "accent",
  NEEDS_CORRECTION: "danger",
  APPROVED: "success",
  PUBLISHED: "success",
};

export function ResultsStatusBadge({ status }: { status: ResultSubmissionStatus }) {
  return <Badge tone={RESULTS_STATUS_TONE[status]}>{RESULTS_STATUS_LABEL[status]}</Badge>;
}
