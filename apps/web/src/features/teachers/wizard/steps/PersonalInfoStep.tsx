"use client";

import { FormField, Input } from "@/components/ui/FormControls";
import { Alert } from "@/components/ui/Alert";
import type { TeacherWizardState } from "../types";

export function PersonalInfoStep({
  state,
  onChange,
}: {
  state: TeacherWizardState;
  onChange: (patch: Partial<TeacherWizardState>) => void;
}) {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-sm font-semibold text-foreground">Personal information</h2>
        <p className="mt-0.5 text-sm text-foreground-soft">The teacher&apos;s basic identity details.</p>
      </div>

      <Alert tone="info">A staff code (e.g. EMP-00007) is generated automatically once this teacher is created.</Alert>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FormField label="First name" required>
          <Input required value={state.firstName} onChange={(e) => onChange({ firstName: e.target.value })} />
        </FormField>
        <FormField label="Last name" required>
          <Input required value={state.lastName} onChange={(e) => onChange({ lastName: e.target.value })} />
        </FormField>
      </div>
    </div>
  );
}

export function isPersonalInfoValid(state: TeacherWizardState): boolean {
  return state.firstName.trim().length > 0 && state.lastName.trim().length > 0;
}
