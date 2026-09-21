"use client";

import { useState } from "react";
import { ApiError } from "@/lib/auth-context";
import { api, type AcademicYear, type Exam } from "@/lib/api";
import { Badge } from "@/components/ui/Badge";
import { Select } from "@/components/ui/FormControls";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useToast } from "@/components/ui/Toast";

// Shows which of the academic year's two terms an exam counts toward — the
// only thing that puts its results into a student's Term 1 / Term 2 /
// Annual Result and into Promotion — and lets an Admin correct it. Legacy
// exams created before Terms existed show "No term assigned" (they count
// toward neither term until one is chosen).
export function ExamTermControl({
  schoolId,
  accessToken,
  exam,
  years,
  canManage,
  onChanged,
}: {
  schoolId: string;
  accessToken: string;
  exam: Exam;
  years: AcademicYear[];
  canManage: boolean;
  onChanged: (term: { id: string; name: string }) => void;
}) {
  const { show } = useToast();
  const terms = years.find((y) => y.id === exam.academicYearId)?.terms ?? [];
  const [pendingTermId, setPendingTermId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const pendingTerm = terms.find((t) => t.id === pendingTermId) ?? null;

  async function confirmChange() {
    if (!pendingTerm) return;
    setSaving(true);
    try {
      const updated = await api.updateExamTerm(accessToken, schoolId, exam.id, { termId: pendingTerm.id });
      onChanged(updated.term ?? { id: pendingTerm.id, name: pendingTerm.name });
      show(`${exam.name} now counts toward ${pendingTerm.name}.`);
      setPendingTermId(null);
    } catch (err) {
      show(err instanceof ApiError ? err.message : "Failed to change the exam's term", "danger");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {exam.term ? <Badge tone="accent">{exam.term.name}</Badge> : <Badge tone="warning">No term assigned</Badge>}
      {canManage && terms.length > 0 && (
        <Select
          value={exam.termId ?? ""}
          onChange={(e) => e.target.value && e.target.value !== exam.termId && setPendingTermId(e.target.value)}
          className="h-8 w-auto py-1 text-sm"
          aria-label={`Term for ${exam.name}`}
        >
          {!exam.termId && <option value="">Assign a term…</option>}
          {terms.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </Select>
      )}

      <ConfirmDialog
        open={!!pendingTerm}
        title={`Move "${exam.name}" to ${pendingTerm?.name ?? "this term"}?`}
        description={`This exam's results will count toward ${pendingTerm?.name ?? "that term"} in every student's Annual Result and in Promotion. Marks themselves are not changed. This is recorded in the audit log.`}
        confirmLabel={`Move to ${pendingTerm?.name ?? "term"}`}
        tone="primary"
        loading={saving}
        onConfirm={confirmChange}
        onCancel={() => setPendingTermId(null)}
      />
    </div>
  );
}
