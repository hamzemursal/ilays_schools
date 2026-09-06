"use client";

import { Alert } from "@/components/ui/Alert";
import { FormField, Input } from "@/components/ui/FormControls";
import type { ExamWizardState } from "../types";

export function isSettingsValid(state: ExamWizardState): boolean {
  const max = Number(state.maxMarks);
  if (!state.maxMarks.trim() || !Number.isFinite(max) || max <= 0) return false;
  if (state.passingMark.trim()) {
    const pass = Number(state.passingMark);
    if (!Number.isFinite(pass) || pass < 0 || pass > max) return false;
  }
  return true;
}

export function SettingsStep({ state, onChange }: { state: ExamWizardState; onChange: (patch: Partial<ExamWizardState>) => void }) {
  const max = Number(state.maxMarks);
  const pass = state.passingMark.trim() ? Number(state.passingMark) : null;
  const passingMarkError = pass !== null && Number.isFinite(max) && pass > max ? "Passing mark can't exceed the maximum mark." : undefined;

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-sm font-semibold text-foreground">Exam settings</h2>
        <p className="mt-0.5 text-sm text-foreground-soft">
          Applied to every subject you selected — each one stays individually editable afterward from the Exams tab.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FormField label="Maximum Mark" required>
          <Input type="number" min={1} value={state.maxMarks} onChange={(e) => onChange({ maxMarks: e.target.value })} />
        </FormField>

        <FormField label="Passing Mark" hint="Optional — recorded for reference only" error={passingMarkError}>
          <Input type="number" min={0} max={max || undefined} value={state.passingMark} onChange={(e) => onChange({ passingMark: e.target.value })} />
        </FormField>

        <FormField label="Exam Date" hint="Optional — the sitting date for these subjects" className="sm:col-span-2">
          <Input type="date" value={state.examDate} onChange={(e) => onChange({ examDate: e.target.value })} />
        </FormField>
      </div>

      <Alert tone="info">
        This system has no pass/fail grading policy — the passing mark, if you set one, is stored as reference information only and
        doesn&apos;t affect how results are entered, reviewed, or published.
      </Alert>
    </div>
  );
}
