"use client";

import { useRef, useState } from "react";
import { Download, Upload } from "lucide-react";
import { useAuth, ApiError } from "@/lib/auth-context";
import type { ImportBatchDetail } from "@/lib/api";
import { importsApi, downloadImportTemplate } from "../api";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";

export function ImportUploadForm({
  schoolId,
  onUploaded,
}: {
  schoolId: string;
  onUploaded: (batch: ImportBatchDetail) => void;
}) {
  const { accessToken } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onFileChosen(file: File | undefined) {
    if (!file || !accessToken) return;
    setFileName(file.name);
    setError(null);
    setUploading(true);
    try {
      const batch = await importsApi.upload(accessToken, schoolId, file);
      onUploaded(batch);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to import file");
    } finally {
      setUploading(false);
    }
  }

  return (
    <Card>
      <h2 className="text-sm font-semibold text-foreground">Import students from CSV</h2>
      <p className="mt-1 text-sm text-foreground-soft">
        Required columns: firstName, lastName, dateOfBirth (YYYY-MM-DD), sex (MALE/FEMALE), academicYear, className,
        sectionName. Optional: studentNumber, rollNumber, and a single guardian per row (guardianFirstName,
        guardianLastName, guardianPhone, guardianEmail, guardianRelationship).
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button variant="outline" size="sm" icon={<Download className="size-4" />} onClick={downloadImportTemplate}>
          Download template
        </Button>
        <Button
          size="sm"
          icon={<Upload className="size-4" />}
          loading={uploading}
          onClick={() => inputRef.current?.click()}
        >
          {uploading ? "Processing…" : "Upload CSV"}
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={(e) => onFileChosen(e.target.files?.[0])}
        />
        {fileName && !error && <span className="text-sm text-foreground-muted">{fileName}</span>}
      </div>

      {error && (
        <Alert tone="danger" className="mt-4">
          {error}
        </Alert>
      )}
    </Card>
  );
}
