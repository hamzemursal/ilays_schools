"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useAuth, ApiError } from "@/lib/auth-context";
import { api, type ResultsForSection } from "@/lib/api";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { Input } from "@/components/ui/FormControls";
import { SkeletonCards } from "@/components/ui/Skeleton";
import { ResultsStatusBadge } from "@/features/exams/ExamStatusBadges";
import { SubmitResultsDialog } from "@/features/exams/SubmitResultsDialog";
import { ReturnForCorrectionDialog } from "@/features/exams/ReturnForCorrectionDialog";
import { ApproveResultsDialog } from "@/features/exams/ApproveResultsDialog";
import { PublishResultsDialog } from "@/features/exams/PublishResultsDialog";
import { UnpublishResultsDialog } from "@/features/exams/UnpublishResultsDialog";
import { CheckCircle2, Megaphone, Printer, RotateCcw, Save, Send, Undo2 } from "lucide-react";

export default function ResultsPage({
  params,
}: {
  params: Promise<{ id: string; examSubjectId: string; sectionId: string }>;
}) {
  const { id: schoolId, examSubjectId, sectionId } = use(params);
  const { accessToken, user } = useAuth();

  const [data, setData] = useState<ResultsForSection | null>(null);
  const [pending, setPending] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedMessage, setSavedMessage] = useState(false);
  const [submitDialogOpen, setSubmitDialogOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [returnDialogOpen, setReturnDialogOpen] = useState(false);
  const [returning, setReturning] = useState(false);
  const [approveDialogOpen, setApproveDialogOpen] = useState(false);
  const [approving, setApproving] = useState(false);
  const [publishDialogOpen, setPublishDialogOpen] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [unpublishDialogOpen, setUnpublishDialogOpen] = useState(false);
  const [unpublishing, setUnpublishing] = useState(false);

  useEffect(() => {
    if (!accessToken) return;
    api
      .getResults(accessToken, schoolId, examSubjectId, sectionId)
      .then((res) => {
        setData(res);
        setPending(Object.fromEntries(res.students.filter((s) => s.marksObtained !== null).map((s) => [s.enrollmentId, s.marksObtained!])));
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load results"));
  }, [accessToken, schoolId, examSubjectId, sectionId]);

  const isTeacher = user?.roles.includes("TEACHER") ?? false;
  const canApprove = (user?.permissions.includes("results.approve") ?? false) && !isTeacher;
  const editable = !!data && (data.submission.status === "DRAFT" || data.submission.status === "NEEDS_CORRECTION");
  const canReview = canApprove && data?.submission.status === "SUBMITTED";
  const canPublish = canApprove && data?.submission.status === "APPROVED";
  const canUnpublish = canApprove && data?.submission.status === "PUBLISHED";

  async function save(): Promise<ResultsForSection | null> {
    if (!accessToken || !data) return null;
    setSaving(true);
    setError(null);
    try {
      const entries = Object.entries(pending)
        .filter(([, v]) => v.trim() !== "")
        .map(([enrollmentId, v]) => ({ enrollmentId, marksObtained: Number(v) }));
      const updated = await api.enterMarks(accessToken, schoolId, examSubjectId, sectionId, entries);
      setData(updated);
      setSavedMessage(true);
      return updated;
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to save marks");
      return null;
    } finally {
      setSaving(false);
    }
  }

  async function openSubmitDialog() {
    setSavedMessage(false);
    const fresh = await save();
    if (fresh) setSubmitDialogOpen(true);
  }

  async function confirmSubmit() {
    if (!accessToken) return;
    setSubmitting(true);
    setError(null);
    try {
      const updated = await api.submitResultsForReview(accessToken, schoolId, examSubjectId, sectionId);
      setData(updated);
      setSubmitDialogOpen(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to submit results");
    } finally {
      setSubmitting(false);
    }
  }

  async function confirmReturn(reason: string) {
    if (!accessToken) return;
    setReturning(true);
    setError(null);
    try {
      const updated = await api.returnResultsForCorrection(accessToken, schoolId, examSubjectId, sectionId, reason);
      setData(updated);
      setReturnDialogOpen(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to return results for correction");
    } finally {
      setReturning(false);
    }
  }

  async function confirmApprove() {
    if (!accessToken) return;
    setApproving(true);
    setError(null);
    try {
      const updated = await api.approveResultsSubmission(accessToken, schoolId, examSubjectId, sectionId);
      setData(updated);
      setApproveDialogOpen(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to approve results");
    } finally {
      setApproving(false);
    }
  }

  async function confirmPublish() {
    if (!accessToken) return;
    setPublishing(true);
    setError(null);
    try {
      const updated = await api.publishResultsSubmission(accessToken, schoolId, examSubjectId, sectionId);
      setData(updated);
      setPublishDialogOpen(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to publish results");
    } finally {
      setPublishing(false);
    }
  }

  async function confirmUnpublish(reason: string) {
    if (!accessToken) return;
    setUnpublishing(true);
    setError(null);
    try {
      const updated = await api.unpublishResultsSubmission(accessToken, schoolId, examSubjectId, sectionId, reason);
      setData(updated);
      setUnpublishDialogOpen(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to undo publish");
    } finally {
      setUnpublishing(false);
    }
  }

  const contextLine = data
    ? `${data.context.academicYearName} · ${data.context.examName} · ${data.context.className} · Section ${data.context.sectionName} · ${data.context.subjectName}`
    : undefined;

  return (
    <div>
      <PageHeader
        eyebrow="Exams & Results"
        title={canApprove && !isTeacher ? "Review Student Results" : "Enter Student Results"}
        description={contextLine}
        breadcrumbs={[
          { label: isTeacher ? "My Exams" : "Results Review", href: isTeacher ? "/my-exams" : `/schools/${schoolId}/results-review` },
          { label: "Results" },
        ]}
      />

      <div className="mx-auto max-w-3xl space-y-5 p-4 sm:p-6">
        {error && <Alert tone="danger">{error}</Alert>}

        {!data ? (
          <SkeletonCards count={2} />
        ) : (
          <>
            <Card padding="none">
              <CardHeader
                title={data.context.examName}
                description={data.context.examDate ? new Date(data.context.examDate).toLocaleDateString() : undefined}
                actions={
                  canApprove && (
                    <Link href={`/schools/${schoolId}/exam-subjects/${examSubjectId}/sections/${sectionId}/print`} target="_blank">
                      <Button size="sm" variant="outline" icon={<Printer className="size-3.5" />}>
                        Print Result Sheet
                      </Button>
                    </Link>
                  )
                }
              />
              <div className="flex flex-wrap items-center gap-2 border-t border-border p-5">
                <Badge tone="accent">{data.context.subjectName}</Badge>
                <Badge tone="neutral">Out of {data.maxMarks}</Badge>
                {data.context.teacherName && <Badge tone="neutral">{data.context.teacherName}</Badge>}
                <ResultsStatusBadge status={data.submission.status} />
                <span className="ml-auto text-sm text-foreground-soft">
                  {data.completedCount} / {data.students.length} student(s) completed
                </span>
              </div>
              {(data.average !== null || data.highest !== null || data.lowest !== null) && (
                <div className="flex flex-wrap gap-4 border-t border-border p-5 text-sm">
                  <span className="text-foreground-soft">
                    Average <span className="font-medium text-foreground">{data.average}</span>
                  </span>
                  <span className="text-foreground-soft">
                    Highest <span className="font-medium text-foreground">{data.highest}</span>
                  </span>
                  <span className="text-foreground-soft">
                    Lowest <span className="font-medium text-foreground">{data.lowest}</span>
                  </span>
                </div>
              )}
            </Card>

            {data.submission.status === "NEEDS_CORRECTION" && data.submission.returnReason && (
              <Alert tone="danger">
                <p className="font-medium">Correction Required</p>
                <p className="mt-1">{data.submission.returnReason}</p>
              </Alert>
            )}
            {data.submission.status === "SUBMITTED" && !canApprove && <Alert tone="warning">Submitted — waiting for Admin review.</Alert>}
            {data.submission.status === "APPROVED" && !canPublish && <Alert tone="success">Approved — waiting to be published.</Alert>}
            {data.submission.status === "PUBLISHED" && <Alert tone="success">Published — visible to students and parents.</Alert>}

            {data.students.length === 0 ? (
              <Card>
                <p className="py-6 text-center text-sm text-foreground-muted">No active students in this section.</p>
              </Card>
            ) : (
              <div className="space-y-2">
                {data.students.map((s) => (
                  <Card key={s.enrollmentId} padding="sm">
                    <div className="flex flex-col gap-2 p-2 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex min-w-0 items-center gap-3">
                        <Avatar name={`${s.firstName} ${s.lastName}`} photoUrl={s.photoUrl} size="md" />
                        <div className="min-w-0">
                          <p className="truncate font-medium text-foreground">
                            <span className="text-foreground-muted">#{s.rollNumber}</span> {s.firstName} {s.lastName}
                          </p>
                          <p className="font-mono text-xs text-foreground-muted">{s.studentNumber}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <Input
                          type="number"
                          min={0}
                          max={data.maxMarks}
                          value={pending[s.enrollmentId] ?? ""}
                          disabled={!editable}
                          onChange={(e) => setPending((prev) => ({ ...prev, [s.enrollmentId]: e.target.value }))}
                          className="w-24"
                        />
                        <span className="w-14 text-right text-sm text-foreground-soft">{s.percentage !== null ? `${s.percentage}%` : "—"}</span>
                        <Badge tone={s.hasMark ? "success" : "neutral"}>{s.hasMark ? "Entered" : "Missing"}</Badge>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            )}

            {editable && !canApprove && data.students.length > 0 && (
              <div className="flex flex-wrap items-center gap-3">
                <Button variant="outline" icon={<Save className="size-4" />} loading={saving} onClick={() => save()}>
                  Save Draft
                </Button>
                <Button icon={<Send className="size-4" />} onClick={openSubmitDialog}>
                  {data.submission.status === "NEEDS_CORRECTION" ? "Resubmit for Review" : "Submit for Review"}
                </Button>
                {savedMessage && (
                  <span className="inline-flex items-center gap-1.5 text-sm text-success">
                    <CheckCircle2 className="size-4" /> Saved.
                  </span>
                )}
              </div>
            )}

            {canReview && (
              <div className="flex flex-wrap items-center gap-3">
                <Button variant="outline" icon={<RotateCcw className="size-4" />} onClick={() => setReturnDialogOpen(true)}>
                  Return for Correction
                </Button>
                <Button icon={<CheckCircle2 className="size-4" />} onClick={() => setApproveDialogOpen(true)}>
                  Approve Results
                </Button>
              </div>
            )}

            {canPublish && (
              <div className="flex flex-wrap items-center gap-3">
                <Button icon={<Megaphone className="size-4" />} onClick={() => setPublishDialogOpen(true)}>
                  Publish Results
                </Button>
              </div>
            )}

            {canUnpublish && (
              <div className="flex flex-wrap items-center gap-3">
                <Button variant="outline" icon={<Undo2 className="size-4" />} onClick={() => setUnpublishDialogOpen(true)}>
                  Undo Publish
                </Button>
              </div>
            )}
          </>
        )}
      </div>

      {data && (
        <>
          <SubmitResultsDialog
            open={submitDialogOpen}
            examName={data.context.examName}
            className={data.context.className}
            sectionName={data.context.sectionName}
            subjectName={data.context.subjectName}
            studentCount={data.students.length}
            completedCount={data.completedCount}
            missingCount={data.missingCount}
            isResubmit={data.submission.status === "NEEDS_CORRECTION"}
            loading={submitting}
            onConfirm={confirmSubmit}
            onCancel={() => setSubmitDialogOpen(false)}
          />
          <ReturnForCorrectionDialog
            open={returnDialogOpen}
            loading={returning}
            onConfirm={confirmReturn}
            onCancel={() => setReturnDialogOpen(false)}
          />
          <ApproveResultsDialog
            open={approveDialogOpen}
            examName={data.context.examName}
            className={data.context.className}
            sectionName={data.context.sectionName}
            subjectName={data.context.subjectName}
            teacherName={data.context.teacherName}
            studentCount={data.students.length}
            completedCount={data.completedCount}
            average={data.average}
            highest={data.highest}
            lowest={data.lowest}
            loading={approving}
            onConfirm={confirmApprove}
            onCancel={() => setApproveDialogOpen(false)}
          />
          <PublishResultsDialog
            open={publishDialogOpen}
            examName={data.context.examName}
            className={data.context.className}
            sectionName={data.context.sectionName}
            subjectName={data.context.subjectName}
            studentCount={data.students.length}
            loading={publishing}
            onConfirm={confirmPublish}
            onCancel={() => setPublishDialogOpen(false)}
          />
          <UnpublishResultsDialog
            open={unpublishDialogOpen}
            loading={unpublishing}
            onConfirm={confirmUnpublish}
            onCancel={() => setUnpublishDialogOpen(false)}
          />
        </>
      )}
    </div>
  );
}
