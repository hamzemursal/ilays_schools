"use client";

import { Alert } from "@/components/ui/Alert";
import { FormField, Input } from "@/components/ui/FormControls";
import type { ExamWizardState } from "../types";

// Only meaningful once both bounds are known — Start Date/End Date are
// optional, so an exam that never set them has nothing to check Exam Date
// against.
export function examDateError(state: ExamWizardState): string | null {
  if (!state.examDate) return null;
  if (state.startDate && state.examDate < state.startDate) return "Exam Date can't be before Start Date.";
  if (state.endDate && state.examDate > state.endDate) return "Exam Date can't be after End Date.";
  return null;
}

export function isSettingsValid(state: ExamWizardState): boolean {
  const max = Number(state.maxMarks);
  if (!state.maxMarks.trim() || !Number.isInteger(max) || max <= 0 || max > 1000) return false;
  if (state.passingMark.trim()) {
    const pass = Number(state.passingMark);
    if (!Number.isInteger(pass) || pass < 0 || pass > max) return false;
  }
  if (examDateError(state) !== null) return false;
  return true;
}

export function SettingsStep({ state, onChange }: { state: ExamWizardState; onChange: (patch: Partial<ExamWizardState>) => void }) {
  const max = Number(state.maxMarks);
  const pass = state.passingMark.trim() ? Number(state.passingMark) : null;
  const passingMarkError = pass !== null && Number.isFinite(max) && pass > max ? "Passing mark can't exceed the maximum mark." : undefined;
  const dateError = examDateError(state);

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
          <Input type="number" min={1} max={1000} step={1} value={state.maxMarks} onChange={(e) => onChange({ maxMarks: e.target.value })} />
        </FormField>

        <FormField label="Passing Mark" hint="Optional — recorded for reference only" error={passingMarkError}>
          <Input type="number" min={0} max={max || undefined} value={state.passingMark} onChange={(e) => onChange({ passingMark: e.target.value })} />
        </FormField>

        <FormField
          label="Exam Date"
          hint="Optional — the sitting date for these subjects. Follows Start Date until you change it here."
          error={dateError ?? undefined}
          className="sm:col-span-2"
        >
          <Input
            type="date"
            value={state.examDate}
            onChange={(e) => onChange({ examDate: e.target.value, examDateTouched: true })}
          />
        </FormField>
      </div>

      <Alert tone="info">
        This system has no pass/fail grading policy — the passing mark, if you set one, is stored as reference information only and
        doesn&apos;t affect how results are entered, reviewed, or published.
      </Alert>
    </div>
  );
}
