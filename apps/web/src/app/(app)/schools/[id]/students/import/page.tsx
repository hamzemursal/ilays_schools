"use client";

import { use, useEffect, useState } from "react";
import { useAuth, ApiError } from "@/lib/auth-context";
import type { ImportBatch, ImportBatchDetail } from "@/lib/api";
import { importsApi } from "@/features/imports/api";
import { ImportUploadForm } from "@/features/imports/components/ImportUploadForm";
import { ImportBatchReview } from "@/features/imports/components/ImportBatchReview";
import { ImportHistory } from "@/features/imports/components/ImportHistory";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { SkeletonTable } from "@/components/ui/Skeleton";
import { ArrowLeft } from "lucide-react";

export default function StudentsImportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: schoolId } = use(params);
  const { accessToken } = useAuth();

  const [batches, setBatches] = useState<ImportBatch[] | null>(null);
  const [activeBatch, setActiveBatch] = useState<ImportBatchDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  function refreshHistory() {
    if (!accessToken) return;
    importsApi
      .list(accessToken, schoolId)
      .then(setBatches)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load import history"));
  }

  useEffect(refreshHistory, [accessToken, schoolId]);

  async function openBatch(batchId: string) {
    if (!accessToken) return;
    try {
      const detail = await importsApi.getOne(accessToken, schoolId, batchId);
      setActiveBatch(detail);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load import batch");
    }
  }

  return (
    <div>
      <PageHeader
        eyebrow="Students"
        title="Import students"
        breadcrumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Students", href: `/schools/${schoolId}/students` },
          { label: "Import" },
        ]}
        actions={
          activeBatch && (
            <Button
              variant="outline"
              icon={<ArrowLeft className="size-4" />}
              onClick={() => {
                setActiveBatch(null);
                refreshHistory();
              }}
            >
              Back to imports
            </Button>
          )
        }
      />

      <div className="space-y-6 p-4 sm:p-6">
        {error && <Alert tone="danger">{error}</Alert>}

        {activeBatch ? (
          <ImportBatchReview schoolId={schoolId} batch={activeBatch} onUpdated={setActiveBatch} />
        ) : (
          <>
            <ImportUploadForm schoolId={schoolId} onUploaded={setActiveBatch} />

            <section>
              <h2 className="mb-3 text-sm font-semibold text-foreground">Previous imports</h2>
              {!batches ? <SkeletonTable rows={3} cols={4} /> : <ImportHistory batches={batches} onSelect={openBatch} />}
            </section>
          </>
        )}
      </div>
    </div>
  );
}
