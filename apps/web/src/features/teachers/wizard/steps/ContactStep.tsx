"use client";

import { FormField, Input } from "@/components/ui/FormControls";
import type { TeacherWizardState } from "../types";

export function ContactStep({
  state,
  onChange,
}: {
  state: TeacherWizardState;
  onChange: (patch: Partial<TeacherWizardState>) => void;
}) {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-sm font-semibold text-foreground">Contact & qualification</h2>
        <p className="mt-0.5 text-sm text-foreground-soft">All optional — fill in what you have on file.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FormField label="Qualification">
          <Input
            value={state.qualification}
            onChange={(e) => onChange({ qualification: e.target.value })}
            placeholder="B.Ed, M.Sc…"
          />
        </FormField>
        <FormField label="Phone">
          <Input type="tel" value={state.phone} onChange={(e) => onChange({ phone: e.target.value })} />
        </FormField>
        <FormField label="Email" hint="Needed later to invite this teacher to log in.">
          <Input type="email" value={state.email} onChange={(e) => onChange({ email: e.target.value })} />
        </FormField>
      </div>
    </div>
  );
}
