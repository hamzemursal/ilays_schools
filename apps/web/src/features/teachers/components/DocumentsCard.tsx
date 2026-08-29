"use client";

import { useEffect, useRef, useState } from "react";
import { FileText, Upload } from "lucide-react";
import type { TeacherDocument } from "@/lib/api";
import { ApiError } from "@/lib/auth-context";
import { Card, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/FormControls";
import { useToast } from "@/components/ui/Toast";

// Shared between the admin Teacher Profile and the teacher's own portal —
// which owner's documents it shows is entirely decided by the list/upload
// callbacks the caller passes in (school-scoped admin routes vs. the
// teacher's own self-service /teachers/me/documents routes).
export function DocumentsCard({
  canUpload,
  list,
  upload,
}: {
  canUpload: boolean;
  list: () => Promise<TeacherDocument[]>;
  upload: (file: File, label?: string) => Promise<TeacherDocument>;
}) {
  const { show } = useToast();
  const [documents, setDocuments] = useState<TeacherDocument[] | null>(null);
  const [label, setLabel] = useState("");
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    list()
      .then(setDocuments)
      .catch(() => setDocuments([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    try {
      const doc = await upload(file, label || undefined);
      setDocuments((prev) => [doc, ...(prev ?? [])]);
      setLabel("");
      show("Document uploaded.");
    } catch (err) {
      show(err instanceof ApiError ? err.message : "Upload failed", "danger");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <Card padding="none">
      <CardHeader title="Documents" description="Qualification and certification attachments." />
      <div className="space-y-3 p-5">
        {canUpload && (
          <div className="flex flex-wrap items-center gap-2">
            <Input
              placeholder="Label (e.g. Teaching Certificate)"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              className="max-w-xs"
            />
            <Button
              type="button"
              size="sm"
              variant="outline"
              icon={<Upload className="size-4" />}
              loading={uploading}
              onClick={() => inputRef.current?.click()}
            >
              Upload document
            </Button>
            <input
              ref={inputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,application/pdf"
              className="hidden"
              onChange={(e) => handleFile(e.target.files?.[0])}
            />
          </div>
        )}
        {!documents ? (
          <p className="text-sm text-foreground-muted">Loading…</p>
        ) : documents.length === 0 ? (
          <EmptyState
            icon={FileText}
            title="No documents yet"
            description="Upload a qualification or certification file."
          />
        ) : (
          <ul className="divide-y divide-border">
            {documents.map((d) => (
              <li key={d.id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <a
                    href={d.url}
                    target="_blank"
                    rel="noreferrer"
                    className="truncate text-sm font-medium text-accent hover:underline"
                  >
                    {d.label || d.mimeType}
                  </a>
                  <p className="text-xs text-foreground-muted">
                    {(d.sizeBytes / 1024).toFixed(0)} KB · {new Date(d.uploadedAt).toLocaleDateString()}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}
