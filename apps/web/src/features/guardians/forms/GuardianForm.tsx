"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Search, UserPlus } from "lucide-react";
import type { GuardianInput, GuardianRecord, GuardianRelationship, GuardianSearchResult } from "@/lib/api";
import { api } from "@/lib/api";
import { ApiError } from "@/lib/auth-context";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { FormField, Input, Select } from "@/components/ui/FormControls";
import { GuardianFieldSet, emptyGuardian } from "../components/GuardianFieldSet";

const RELATIONSHIPS: { value: GuardianRelationship; label: string }[] = [
  { value: "FATHER", label: "Father" },
  { value: "MOTHER", label: "Mother" },
  { value: "GUARDIAN", label: "Guardian" },
  { value: "OTHER", label: "Other" },
];

// Search-existing-parent first, create-new only as a fallback — the same
// duplicate-prevention shape already proven in the new-student wizard's own
// guardian step (GuardianStep.tsx), just wired to the real
// POST students/:id/guardians endpoint instead of local wizard state, since
// this student already exists. existingGuardianId short-circuits the
// backend's own findOrCreate (see GuardiansService.findOrCreate) straight to
// the chosen record — no phone/email guesswork, no duplicate created.
export function GuardianForm({
  accessToken,
  schoolId,
  studentId,
  onAdded,
  onCancel,
}: {
  accessToken: string;
  schoolId: string;
  studentId: string;
  onAdded: (guardian: GuardianRecord) => void;
  onCancel: () => void;
}) {
  const [mode, setMode] = useState<"search" | "create">("search");

  return mode === "search" ? (
    <SearchExistingParent
      accessToken={accessToken}
      schoolId={schoolId}
      studentId={studentId}
      onAdded={onAdded}
      onCancel={onCancel}
      onCreateNew={() => setMode("create")}
    />
  ) : (
    <CreateNewParent accessToken={accessToken} studentId={studentId} onAdded={onAdded} onCancel={onCancel} />
  );
}

function SearchExistingParent({
  accessToken,
  schoolId,
  studentId,
  onAdded,
  onCancel,
  onCreateNew,
}: {
  accessToken: string;
  schoolId: string;
  studentId: string;
  onAdded: (guardian: GuardianRecord) => void;
  onCancel: () => void;
  onCreateNew: () => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GuardianSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<GuardianSearchResult | null>(null);
  const [relationship, setRelationship] = useState<GuardianRelationship>("FATHER");
  const [isPrimaryContact, setIsPrimaryContact] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }
    const handle = setTimeout(() => {
      setSearching(true);
      api
        .searchGuardians(accessToken, schoolId, query)
        .then(setResults)
        .catch(() => setResults([]))
        .finally(() => setSearching(false));
    }, 300);
    return () => clearTimeout(handle);
  }, [accessToken, schoolId, query]);

  async function linkSelected() {
    if (!selected) return;
    setError(null);
    setSubmitting(true);
    try {
      const guardian = await api.addGuardian(accessToken, studentId, {
        existingGuardianId: selected.id,
        firstName: selected.firstName,
        lastName: selected.lastName,
        phone: selected.phone ?? undefined,
        email: selected.email ?? undefined,
        relationship,
        isPrimaryContact,
      });
      onAdded(guardian);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to link parent");
    } finally {
      setSubmitting(false);
    }
  }

  const searched = query.trim().length >= 2;

  if (selected) {
    return (
      <div className="rounded-xl border border-border bg-surface-soft p-4">
        <h3 className="text-sm font-semibold text-foreground">Link {selected.firstName} to this student</h3>
        <div className="mt-3 rounded-lg border border-accent bg-accent-soft px-3 py-2">
          <p className="text-sm font-medium text-foreground">
            {selected.firstName} {selected.lastName}
          </p>
          <p className="text-xs text-foreground-soft">{selected.phone ?? selected.email ?? "No contact on file"}</p>
        </div>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <FormField label="Relationship" required>
            <Select
              aria-label="Relationship"
              value={relationship}
              onChange={(e) => setRelationship(e.target.value as GuardianRelationship)}
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
              checked={isPrimaryContact}
              onChange={(e) => setIsPrimaryContact(e.target.checked)}
              className="size-4 rounded border-border text-accent focus:ring-accent/40"
            />
            Primary contact
          </label>
        </div>
        {error && (
          <Alert tone="danger" className="mt-3">
            {error}
          </Alert>
        )}
        <div className="mt-4 flex gap-2">
          <Button size="sm" loading={submitting} onClick={linkSelected}>
            Save / Link Parent
          </Button>
          <Button size="sm" variant="outline" onClick={() => setSelected(null)}>
            Back to search
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-surface-soft p-4">
      <h3 className="text-sm font-semibold text-foreground">Parent / guardian</h3>
      <p className="mt-0.5 text-xs text-foreground-soft">Search Existing Parent</p>
      <div className="relative mt-2">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-foreground-muted" />
        <Input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search parent by name, phone, or email…"
          className="pl-9"
        />
      </div>

      {searched && (
        <div className="mt-3 space-y-1.5">
          {searching ? (
            <p className="px-1 py-2 text-sm text-foreground-muted">Searching…</p>
          ) : results.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border p-4 text-center">
              <p className="text-sm text-foreground-muted">No existing parent found.</p>
              <Button size="sm" variant="outline" icon={<UserPlus className="size-4" />} className="mt-3" onClick={onCreateNew}>
                Create New Parent
              </Button>
            </div>
          ) : (
            results.map((r) => (
              <div key={r.id} className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background p-3">
                <div className="min-w-0">
                  <p className="font-medium text-foreground">
                    {r.firstName} {r.lastName}
                  </p>
                  <p className="truncate text-sm text-foreground-soft">{r.phone ?? r.email ?? "No contact on file"}</p>
                  <p className="text-xs text-foreground-muted">
                    Already linked to {r.linkedStudentCount} student{r.linkedStudentCount === 1 ? "" : "s"}
                  </p>
                </div>
                <Button size="sm" variant="outline" onClick={() => setSelected(r)}>
                  Select Parent
                </Button>
              </div>
            ))
          )}
        </div>
      )}

      <div className="mt-4 flex items-center gap-3">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        {!searched && (
          <button type="button" onClick={onCreateNew} className="text-sm font-medium text-accent hover:underline">
            Create a new parent instead
          </button>
        )}
      </div>
    </div>
  );
}

function CreateNewParent({
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
      <h3 className="text-sm font-semibold text-foreground">Create New Parent</h3>
      <div className="mt-3">
        <GuardianFieldSet value={value} onChange={setValue} />
      </div>
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
