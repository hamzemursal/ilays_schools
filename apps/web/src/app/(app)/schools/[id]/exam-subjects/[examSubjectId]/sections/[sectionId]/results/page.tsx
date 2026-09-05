"use client";

import { use, useEffect, useState } from "react";
import { useAuth, ApiError } from "@/lib/auth-context";
import { api, type MyExamRow, type ResultsForSection } from "@/lib/api";
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
import { CheckCircle2, Save, Send } from "lucide-react";

export default function ResultsPage({
  params,
}: {
  params: Promise<{ id: string; examSubjectId: string; sectionId: string }>;
}) {
  const { id: schoolId, examSubjectId, sectionId } = use(params);
  const { accessToken } = useAuth();

  const [context, setContext] = useState<MyExamRow | null | undefined>(undefined);
  const [data, setData] = useState<ResultsForSection | null>(null);
  const [pending, setPending] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedMessage, setSavedMessage] = useState(false);
  const [submitDialogOpen, setSubmitDialogOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!accessToken) return;
    api
      .listMyExams(accessToken)
      .then((rows) => setContext(rows.find((r) => r.examSubjectId === examSubjectId && r.sectionId === sectionId) ?? null));
  }, [accessToken, examSubjectId, sectionId]);

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

  const editable = !data || data.submission.status === "DRAFT" || data.submission.status === "NEEDS_CORRECTION";

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

  const contextLine = context
    ? `${context.academicYearName} · ${context.examName} · ${context.className} · Section ${context.sectionName} · ${context.subjectName}`
    : undefined;

  return (
    <div>
      <PageHeader
        eyebrow="Exams & Results"
        title="Enter Student Results"
        description={contextLine}
        breadcrumbs={[{ label: "My Exams", href: "/my-exams" }, { label: "Results" }]}
      />

      <div className="mx-auto max-w-3xl space-y-5 p-4 sm:p-6">
        {error && <Alert tone="danger">{error}</Alert>}

        {context === undefined || !data ? (
          <SkeletonCards count={2} />
        ) : (
          <>
            <Card padding="none">
              <CardHeader
                title={context?.examName ?? "Exam"}
                description={context?.examDate ? new Date(context.examDate).toLocaleDateString() : undefined}
              />
              <div className="flex flex-wrap items-center gap-2 border-t border-border p-5">
                <Badge tone="accent">{context?.subjectName}</Badge>
                <Badge tone="neutral">Out of {data.maxMarks}</Badge>
                <ResultsStatusBadge status={data.submission.status} />
                <span className="ml-auto text-sm text-foreground-soft">
                  {data.completedCount} / {data.students.length} student(s) completed
                </span>
              </div>
            </Card>

            {data.submission.status === "NEEDS_CORRECTION" && data.submission.returnReason && (
              <Alert tone="danger">
                <p className="font-medium">Correction Required</p>
                <p className="mt-1">{data.submission.returnReason}</p>
              </Alert>
            )}
            {data.submission.status === "SUBMITTED" && <Alert tone="warning">Submitted — waiting for Admin review.</Alert>}
            {data.submission.status === "APPROVED" && <Alert tone="success">Approved — waiting to be published.</Alert>}
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

            {editable && data.students.length > 0 && (
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
          </>
        )}
      </div>

      {data && context && (
        <SubmitResultsDialog
          open={submitDialogOpen}
          examName={context.examName}
          className={context.className}
          sectionName={context.sectionName}
          subjectName={context.subjectName}
          studentCount={data.students.length}
          completedCount={data.completedCount}
          missingCount={data.missingCount}
          isResubmit={data.submission.status === "NEEDS_CORRECTION"}
          loading={submitting}
          onConfirm={confirmSubmit}
          onCancel={() => setSubmitDialogOpen(false)}
        />
      )}
    </div>
  );
}
