"use client";

import type { AcademicYear, ExamType } from "@/lib/api";
import { FormField, Input, Select, Textarea } from "@/components/ui/FormControls";
import type { ExamWizardState } from "../types";

const EXAM_TYPES: { value: ExamType; label: string }[] = [
  { value: "QUIZ", label: "Quiz" },
  { value: "MIDTERM", label: "Mid-Term" },
  { value: "FINAL", label: "Final" },
  { value: "ASSIGNMENT", label: "Assignment" },
  { value: "OTHER", label: "Other" },
];

export function isBasicInfoValid(state: ExamWizardState): boolean {
  return state.name.trim().length > 0 && state.academicYearId.length > 0;
}

export function BasicInfoStep({
  state,
  years,
  onChange,
}: {
  state: ExamWizardState;
  years: AcademicYear[];
  onChange: (patch: Partial<ExamWizardState>) => void;
}) {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-sm font-semibold text-foreground">Basic information</h2>
        <p className="mt-0.5 text-sm text-foreground-soft">Name this exam and set the period it covers.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FormField label="Exam Name" required className="sm:col-span-2">
          <Input
            required
            value={state.name}
            onChange={(e) => onChange({ name: e.target.value })}
            placeholder="e.g. Mid-Term Exam – Term 1 2027"
            autoFocus
          />
        </FormField>

        <FormField label="Exam Type" required>
          <Select value={state.type} onChange={(e) => onChange({ type: e.target.value as ExamType })}>
            {EXAM_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </Select>
        </FormField>

        <FormField label="Academic Year" required>
          <Select value={state.academicYearId} onChange={(e) => onChange({ academicYearId: e.target.value })}>
            {years.length === 0 && <option value="">No academic years yet</option>}
            {years.map((y) => (
              <option key={y.id} value={y.id}>
                {y.name}
                {y.isCurrent ? " (current)" : ""}
              </option>
            ))}
          </Select>
        </FormField>

        <FormField label="Start Date" hint="Optional">
          <Input type="date" value={state.startDate} onChange={(e) => onChange({ startDate: e.target.value })} />
        </FormField>

        <FormField label="End Date" hint="Optional">
          <Input type="date" value={state.endDate} onChange={(e) => onChange({ endDate: e.target.value })} />
        </FormField>

        <FormField label="Description" hint="Optional" className="sm:col-span-2">
          <Textarea
            value={state.description}
            onChange={(e) => onChange({ description: e.target.value })}
            placeholder="e.g. Covers chapters 1–8 for all Secondary classes."
            rows={3}
          />
        </FormField>
      </div>
    </div>
  );
}
