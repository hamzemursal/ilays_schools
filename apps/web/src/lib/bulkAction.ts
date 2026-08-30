import { ApiError } from "@/lib/auth-context";

export interface BulkActionResult {
  succeededIds: string[];
  failed: { id: string; message: string }[];
}

// Runs `action` against every id independently (never lets one failure block
// the rest — a Class/Subject with history should be skipped, not abort the
// whole batch) and collects a per-id outcome for the caller to summarize.
export async function runBulkAction(ids: string[], action: (id: string) => Promise<unknown>): Promise<BulkActionResult> {
  const results = await Promise.allSettled(ids.map((id) => action(id)));

  const succeededIds: string[] = [];
  const failed: { id: string; message: string }[] = [];

  results.forEach((result, i) => {
    const id = ids[i];
    if (result.status === "fulfilled") {
      succeededIds.push(id);
    } else {
      const message = result.reason instanceof ApiError ? result.reason.message : "Failed";
      failed.push({ id, message });
    }
  });

  return { succeededIds, failed };
}

// A short, human-readable summary for a toast — e.g. "8 archived, 2 skipped
// (Cannot delete this class — it has students enrolled...)".
export function summarizeBulkResult(result: BulkActionResult, verbPast: string): string {
  const parts = [`${result.succeededIds.length} ${verbPast}`];
  if (result.failed.length > 0) {
    const reasons = Array.from(new Set(result.failed.map((f) => f.message))).join("; ");
    parts.push(`${result.failed.length} skipped (${reasons})`);
  }
  return parts.join(", ");
}
