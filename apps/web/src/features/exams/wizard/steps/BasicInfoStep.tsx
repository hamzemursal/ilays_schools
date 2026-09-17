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

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString();
}

// Both dates are optional, but once either is set they must make sense
// together — and against the academic year that actually contains this
// exam. Returns a message to show (and to block "Next" on) or null when
// everything lines up.
export function dateRangeError(state: ExamWizardState, years: AcademicYear[]): string | null {
  if (state.startDate && state.endDate && state.endDate < state.startDate) {
    return "End Date can't be before Start Date.";
  }

  const year = years.find((y) => y.id === state.academicYearId);
  if (year) {
    const yearStart = year.startDate.slice(0, 10);
    const yearEnd = year.endDate.slice(0, 10);
    if (state.startDate && (state.startDate < yearStart || state.startDate > yearEnd)) {
      return `Start Date must fall within ${year.name} (${formatDate(year.startDate)} – ${formatDate(year.endDate)}).`;
    }
    if (state.endDate && (state.endDate < yearStart || state.endDate > yearEnd)) {
      return `End Date must fall within ${year.name} (${formatDate(year.startDate)} – ${formatDate(year.endDate)}).`;
    }
  }

  return null;
}

export function isBasicInfoValid(state: ExamWizardState, years: AcademicYear[]): boolean {
  return (
    state.name.trim().length > 0 &&
    state.academicYearId.length > 0 &&
    state.termId.length > 0 &&
    dateRangeError(state, years) === null
  );
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
  const error = dateRangeError(state, years);
  const selectedYear = years.find((y) => y.id === state.academicYearId);
  const terms = selectedYear?.terms ?? [];

  function onAcademicYearChange(id: string) {
    // Term choices belong to whichever year is selected — a Term 1 id from
    // the previous year isn't even a valid option for the new one (each
    // year's terms have their own ids), so switching years re-defaults to
    // the new year's own Term 1, same as Exam Type/Academic Year already
    // default to a usable value the Admin can still change.
    const year = years.find((y) => y.id === id);
    onChange({ academicYearId: id, termId: year?.terms.find((t) => t.name === "Term 1")?.id ?? "" });
  }

  function onStartDateChange(value: string) {
    // Exam Date (set in the Settings step) auto-follows Start Date until the
    // admin deliberately edits it there — the two used to drift apart
    // silently (Start Date corrected here, Exam Date left stale), which is
    // exactly the mistake this keeps from happening again.
    onChange(state.examDateTouched ? { startDate: value } : { startDate: value, examDate: value });
  }

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

        <FormField label="Academic Year" htmlFor="examAcademicYearId" required>
          <Select id="examAcademicYearId" value={state.academicYearId} onChange={(e) => onAcademicYearChange(e.target.value)}>
            {years.length === 0 && <option value="">No academic years yet</option>}
            {years.map((y) => (
              <option key={y.id} value={y.id}>
                {y.name}
                {y.isCurrent ? " (current)" : ""}
              </option>
            ))}
          </Select>
        </FormField>

        <FormField label="Term" htmlFor="examTermId" required hint="Every exam counts toward one of the year's two terms.">
          <Select
            id="examTermId"
            value={state.termId}
            onChange={(e) => onChange({ termId: e.target.value })}
            disabled={terms.length === 0}
          >
            <option value="">{terms.length === 0 ? "Select an academic year first" : "Select…"}</option>
            {terms.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} ({t.weight}%)
              </option>
            ))}
          </Select>
        </FormField>

        <FormField label="Start Date" hint="Optional">
          <Input type="date" value={state.startDate} onChange={(e) => onStartDateChange(e.target.value)} />
        </FormField>

        <FormField label="End Date" hint="Optional">
          <Input type="date" value={state.endDate} onChange={(e) => onChange({ endDate: e.target.value })} />
        </FormField>

        {error && (
          <p className="sm:col-span-2 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>
        )}

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
