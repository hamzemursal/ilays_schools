"use client";

import { useState, type FormEvent } from "react";
import type { GuardianInput, GuardianRecord } from "@/lib/api";
import { api } from "@/lib/api";
import { ApiError } from "@/lib/auth-context";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { GuardianFieldSet, emptyGuardian } from "../components/GuardianFieldSet";

export function GuardianForm({
  accessToken,
  studentId,
  onAdded,
  onCancel,
}: {
  accessToken: string;
  studentId: string;
  onAdded: (guardian: GuardianRecord) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState<GuardianInput>(emptyGuardian());
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const guardian = await api.addGuardian(accessToken, studentId, value);
      onAdded(guardian);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to add guardian");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="rounded-xl border border-border bg-surface-soft p-4">
      <GuardianFieldSet value={value} onChange={setValue} />
      {error && (
        <Alert tone="danger" className="mt-3">
          {error}
        </Alert>
      )}
      <div className="mt-4 flex gap-2">
        <Button type="submit" size="sm" loading={submitting}>
          Add guardian
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
