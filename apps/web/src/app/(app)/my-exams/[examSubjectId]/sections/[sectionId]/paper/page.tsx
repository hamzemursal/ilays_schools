"use client";

import { use, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth, ApiError } from "@/lib/auth-context";
import { api, type MyExamRow, type ExamPaperDetail } from "@/lib/api";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardHeader } from "@/components/ui/Card";
import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { FormField, Textarea } from "@/components/ui/FormControls";
import { SkeletonCards } from "@/components/ui/Skeleton";
import { ExamPaperStatusBadge } from "@/features/exams/ExamStatusBadges";
import { FileText, Save, Send, UploadCloud } from "lucide-react";

const ACCEPTED_TYPES = ["application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"];

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function UploadExamPaperPage({ params }: { params: Promise<{ examSubjectId: string; sectionId: string }> }) {
  const { examSubjectId, sectionId } = use(params);
  const { accessToken } = useAuth();
  const router = useRouter();

  const [context, setContext] = useState<MyExamRow | null | undefined>(undefined);
  const [paper, setPaper] = useState<ExamPaperDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [file, setFile] = useState<File | null>(null);
  const [notes, setNotes] = useState("");
  const [dragging, setDragging] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const [savingDraft, setSavingDraft] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState<"draft" | "submitted" | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!accessToken) return;
    api
      .listMyExams(accessToken)
      .then((rows) => setContext(rows.find((r) => r.examSubjectId === examSubjectId && r.sectionId === sectionId) ?? null));
  }, [accessToken, examSubjectId, sectionId]);

  useEffect(() => {
    if (!accessToken || !context) return;
    api
      .getExamPaper(accessToken, context.schoolId, examSubjectId, sectionId)
      .then((p) => {
        setPaper(p);
        setNotes(p.notes ?? "");
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load the exam paper"));
  }, [accessToken, context, examSubjectId, sectionId]);

  function validateAndSetFile(f: File | undefined) {
    if (!f) return;
    setFileError(null);
    if (!ACCEPTED_TYPES.includes(f.type)) {
      setFileError("Only PDF, DOC, or DOCX files are allowed.");
      return;
    }
    if (f.size > 10 * 1024 * 1024) {
      setFileError("File exceeds the 10MB limit.");
      return;
    }
    setFile(f);
  }

  async function save(submit: boolean) {
    if (!accessToken || !context || !file) return;
    if (submit) setSubmitting(true);
    else setSavingDraft(true);
    setError(null);
    setSuccess(null);
    try {
      const updated = await api.uploadExamPaper(accessToken, context.schoolId, examSubjectId, sectionId, file, notes || undefined, submit);
      setPaper(updated);
      setFile(null);
      setSuccess(submit ? "submitted" : "draft");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to upload the exam paper");
    } finally {
      setSavingDraft(false);
      setSubmitting(false);
    }
  }

  if (context === null) {
    return (
      <div className="p-4 sm:p-6">
        <Alert tone="danger">This exam is not assigned to you, or does not exist.</Alert>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        eyebrow="Exams & Results"
        title="Upload Exam Paper"
        breadcrumbs={[{ label: "My Exams", href: "/my-exams" }, { label: "Upload Paper" }]}
      />

      <div className="mx-auto max-w-2xl space-y-5 p-4 sm:p-6">
        {error && <Alert tone="danger">{error}</Alert>}

        {context === undefined || !paper ? (
          <SkeletonCards count={2} />
        ) : (
          <>
            <Card padding="none">
              <CardHeader
                title={context.examName}
                description={`${context.academicYearName} · ${context.className} · Section ${context.sectionName} · ${context.subjectName}`}
              />
              <div className="flex flex-wrap items-center gap-2 border-t border-border p-5">
                <Badge tone="accent">{context.subjectName}</Badge>
                {context.examDate && <Badge tone="neutral">{new Date(context.examDate).toLocaleDateString()}</Badge>}
                <ExamPaperStatusBadge status={paper.paperStatus} />
              </div>
            </Card>

            {paper.file && (
              <Card>
                <p className="mb-2 text-sm font-medium text-foreground-soft">Current paper on file</p>
                <div className="flex items-center gap-3 rounded-lg border border-border p-3">
                  <FileText className="size-8 shrink-0 text-accent" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-foreground">{paper.file.fileName ?? "Exam paper"}</p>
                    <p className="text-xs text-foreground-muted">
                      {paper.file.mimeType} · {formatSize(paper.file.sizeBytes)} · Uploaded {new Date(paper.file.uploadedAt).toLocaleString()}
                    </p>
                  </div>
                  <a href={paper.file.url} target="_blank" rel="noreferrer">
                    <Button size="sm" variant="outline">
                      View
                    </Button>
                  </a>
                </div>
              </Card>
            )}

            <Card>
              <CardHeader
                title={paper.file ? "Replace exam paper" : "Upload exam paper"}
                description="Accepted formats: PDF, DOC, DOCX — up to 10MB."
              />
              <div className="space-y-4 pt-4">
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragging(true);
                  }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragging(false);
                    validateAndSetFile(e.dataTransfer.files?.[0]);
                  }}
                  onClick={() => inputRef.current?.click()}
                  className={`flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed p-8 text-center transition-colors ${
                    dragging ? "border-accent bg-accent-soft" : "border-border hover:border-accent"
                  }`}
                >
                  <UploadCloud className="size-8 text-foreground-muted" />
                  {file ? (
                    <p className="text-sm font-medium text-foreground">{file.name} ({formatSize(file.size)})</p>
                  ) : (
                    <>
                      <p className="text-sm font-medium text-foreground">Drag and drop the exam paper here, or click to browse</p>
                      <p className="text-xs text-foreground-muted">PDF, DOC, or DOCX — up to 10MB</p>
                    </>
                  )}
                  <input
                    ref={inputRef}
                    type="file"
                    accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                    className="hidden"
                    onChange={(e) => validateAndSetFile(e.target.files?.[0])}
                  />
                </div>
                {fileError && <Alert tone="danger">{fileError}</Alert>}

                <FormField label="Notes" hint="Optional — visible to the Admin reviewing this paper.">
                  <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="e.g. Covers chapters 4-7" />
                </FormField>

                {success === "draft" && <Alert tone="success">Saved as draft.</Alert>}
                {success === "submitted" && <Alert tone="success">Exam paper submitted.</Alert>}

                <div className="flex flex-wrap gap-3">
                  <Button
                    variant="outline"
                    icon={<Save className="size-4" />}
                    loading={savingDraft}
                    disabled={!file || submitting}
                    onClick={() => save(false)}
                  >
                    Save Draft
                  </Button>
                  <Button icon={<Send className="size-4" />} loading={submitting} disabled={!file || savingDraft} onClick={() => save(true)}>
                    Submit Exam Paper
                  </Button>
                  <Button variant="ghost" onClick={() => router.push("/my-exams")}>
                    Back to My Exams
                  </Button>
                </div>
              </div>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
