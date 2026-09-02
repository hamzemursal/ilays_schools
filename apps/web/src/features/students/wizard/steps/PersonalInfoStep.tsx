"use client";

import { useRef } from "react";
import { Camera, User } from "lucide-react";
import { FormField, Input, Select } from "@/components/ui/FormControls";
import type { Sex } from "@/lib/api";
import type { WizardState } from "../types";

export function PersonalInfoStep({
  state,
  onChange,
}: {
  state: WizardState;
  onChange: (patch: Partial<WizardState>) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  function onPhotoChosen(file: File | undefined) {
    if (!file) return;
    if (state.photoPreviewUrl) URL.revokeObjectURL(state.photoPreviewUrl);
    onChange({ photoFile: file, photoPreviewUrl: URL.createObjectURL(file) });
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-sm font-semibold text-foreground">Personal information</h2>
        <p className="mt-0.5 text-sm text-foreground-soft">The student&apos;s basic identity details.</p>
      </div>

      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="group relative flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-surface text-foreground-muted hover:border-accent"
        >
          {state.photoPreviewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={state.photoPreviewUrl} alt="" className="size-full object-cover" />
          ) : (
            <User className="size-6" />
          )}
          <span className="absolute inset-0 flex items-center justify-center bg-foreground/0 text-transparent transition-colors group-hover:bg-foreground/40 group-hover:text-white">
            <Camera className="size-4" />
          </span>
        </button>
        <div>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="text-sm font-medium text-accent hover:underline"
          >
            {state.photoPreviewUrl ? "Replace photo" : "Add a photo"}
          </button>
          <p className="text-xs text-foreground-muted">Optional. JPEG, PNG, or WebP.</p>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(e) => onPhotoChosen(e.target.files?.[0])}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FormField label="First name" required>
          <Input required value={state.firstName} onChange={(e) => onChange({ firstName: e.target.value })} />
        </FormField>
        <FormField label="Last name" required>
          <Input required value={state.lastName} onChange={(e) => onChange({ lastName: e.target.value })} />
        </FormField>
        <FormField label="Date of birth" required>
          <Input
            required
            type="date"
            value={state.dateOfBirth}
            onChange={(e) => onChange({ dateOfBirth: e.target.value })}
          />
        </FormField>
        <FormField label="Sex" required>
          <Select value={state.sex} onChange={(e) => onChange({ sex: e.target.value as Sex })}>
            <option value="MALE">Male</option>
            <option value="FEMALE">Female</option>
          </Select>
        </FormField>
        <FormField
          label="Prior / external student ID"
          hint="Optional — from a previous school or system. If provided, it's used to catch duplicate records."
          className="sm:col-span-2"
        >
          <Input
            value={state.legacyStudentNumber}
            onChange={(e) => onChange({ legacyStudentNumber: e.target.value })}
          />
        </FormField>
      </div>
    </div>
  );
}

export function isPersonalInfoValid(state: WizardState): boolean {
  return state.firstName.trim().length > 0 && state.lastName.trim().length > 0 && state.dateOfBirth.length > 0;
}
