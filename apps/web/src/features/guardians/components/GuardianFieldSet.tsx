"use client";

import type { GuardianInput, GuardianRelationship } from "@/lib/api";
import { FormField, Input, Select } from "@/components/ui/FormControls";

const RELATIONSHIPS: { value: GuardianRelationship; label: string }[] = [
  { value: "FATHER", label: "Father" },
  { value: "MOTHER", label: "Mother" },
  { value: "GUARDIAN", label: "Guardian" },
  { value: "OTHER", label: "Other" },
];

export function GuardianFieldSet({
  value,
  onChange,
}: {
  value: GuardianInput;
  onChange: (next: GuardianInput) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <FormField label="First name" required>
        <Input
          required
          value={value.firstName}
          onChange={(e) => onChange({ ...value, firstName: e.target.value })}
        />
      </FormField>
      <FormField label="Last name" required>
        <Input required value={value.lastName} onChange={(e) => onChange({ ...value, lastName: e.target.value })} />
      </FormField>
      <FormField label="Phone" hint="Used to match this guardian across siblings.">
        <Input
          type="tel"
          value={value.phone ?? ""}
          onChange={(e) => onChange({ ...value, phone: e.target.value || undefined })}
        />
      </FormField>
      <FormField label="Email">
        <Input
          type="email"
          value={value.email ?? ""}
          onChange={(e) => onChange({ ...value, email: e.target.value || undefined })}
        />
      </FormField>
      <FormField label="Relationship" required>
        <Select
          value={value.relationship}
          onChange={(e) => onChange({ ...value, relationship: e.target.value as GuardianRelationship })}
        >
          {RELATIONSHIPS.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </Select>
      </FormField>
      <label className="flex items-center gap-2 self-end pb-2 text-sm text-foreground-soft">
        <input
          type="checkbox"
          checked={value.isPrimaryContact ?? false}
          onChange={(e) => onChange({ ...value, isPrimaryContact: e.target.checked })}
          className="size-4 rounded border-border text-accent focus:ring-accent/40"
        />
        Primary contact
      </label>
    </div>
  );
}

export function emptyGuardian(): GuardianInput {
  return { firstName: "", lastName: "", relationship: "FATHER", isPrimaryContact: false };
}
