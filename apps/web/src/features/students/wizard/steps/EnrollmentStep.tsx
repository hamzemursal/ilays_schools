"use client";

import { GraduationCap } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Alert } from "@/components/ui/Alert";
import { FormField, Select } from "@/components/ui/FormControls";
import type { AcademicYear, ClassWithSections } from "@/lib/api";
import type { WizardState } from "../types";

export function EnrollmentStep({
  state,
  onChange,
  years,
  classes,
}: {
  state: WizardState;
  onChange: (patch: Partial<WizardState>) => void;
  years: AcademicYear[];
  classes: ClassWithSections[];
}) {
  const selectedClass = classes.find((c) => c.id === state.classId);

  if (years.length === 0 || classes.length === 0) {
    return (
      <Alert tone="warning">
        This school needs at least one academic year and class before a student can be enrolled. Set those up under
        Academic first.
      </Alert>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-sm font-semibold text-foreground">Academic enrollment</h2>
        <p className="mt-0.5 text-sm text-foreground-soft">
          Where this student is placed. Student Code and Roll Number are assigned automatically.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <FormField label="Academic year" required>
          <Select
            required
            value={state.academicYearId}
            onChange={(e) => onChange({ academicYearId: e.target.value })}
          >
            <option value="">Select…</option>
            {years.map((y) => (
              <option key={y.id} value={y.id}>
                {y.name}
                {y.isCurrent ? " (current)" : ""}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label="Class" required>
          <Select
            required
            value={state.classId}
            onChange={(e) => {
              const cls = classes.find((c) => c.id === e.target.value);
              onChange({ classId: e.target.value, sectionId: cls?.sections[0]?.id ?? "" });
            }}
          >
            <option value="">Select…</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label="Section" required>
          <Select
            required
            value={state.sectionId}
            onChange={(e) => onChange({ sectionId: e.target.value })}
            disabled={!selectedClass}
          >
            <option value="">Select…</option>
            {selectedClass?.sections.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} {s.capacity === null ? "(unlimited)" : `(capacity ${s.capacity})`}
              </option>
            ))}
          </Select>
        </FormField>
      </div>

      {selectedClass && (
        <div className="flex items-center gap-2 rounded-lg border border-border bg-surface-soft px-3 py-2.5 text-sm">
          <GraduationCap className="size-4 text-foreground-muted" />
          <span className="text-foreground-soft">Division, from {selectedClass.name}:</span>
          <Badge tone="accent">{selectedClass.division.type === "PRIMARY" ? "Primary" : "Secondary"}</Badge>
        </div>
      )}
    </div>
  );
}

export function isEnrollmentValid(state: WizardState): boolean {
  return Boolean(state.academicYearId && state.classId && state.sectionId);
}
