"use client";

import type { ImportBatch } from "@/lib/api";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { History } from "lucide-react";

const STATUS_TONE: Record<ImportBatch["status"], "neutral" | "warning" | "success"> = {
  PROCESSING: "neutral",
  NEEDS_REVIEW: "warning",
  COMPLETED: "success",
};

export function ImportHistory({ batches, onSelect }: { batches: ImportBatch[]; onSelect: (batchId: string) => void }) {
  if (batches.length === 0) {
    return <EmptyState icon={History} title="No imports yet" description="Uploaded files will show up here." />;
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full min-w-[560px] text-left text-sm">
        <thead className="bg-surface-soft text-xs font-semibold uppercase tracking-wide text-foreground-muted">
          <tr>
            <th className="px-4 py-2.5">File</th>
            <th className="px-4 py-2.5">Uploaded</th>
            <th className="px-4 py-2.5">Rows</th>
            <th className="px-4 py-2.5">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {batches.map((b) => (
            <tr
              key={b.id}
              onClick={() => onSelect(b.id)}
              className="cursor-pointer bg-background hover:bg-surface-hover"
            >
              <td className="px-4 py-3 text-foreground">{b.fileName}</td>
              <td className="px-4 py-3 text-foreground-soft">{new Date(b.createdAt).toLocaleString()}</td>
              <td className="px-4 py-3 text-foreground-soft">
                {b.createdCount}/{b.totalRows} created
              </td>
              <td className="px-4 py-3">
                <Badge tone={STATUS_TONE[b.status]}>{b.status.replace("_", " ")}</Badge>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
