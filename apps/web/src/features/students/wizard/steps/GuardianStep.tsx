"use client";

import { useEffect, useState } from "react";
import { Plus, Search, Trash2, UserPlus, Users } from "lucide-react";
import { api, type GuardianRelationship, type GuardianSearchResult } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { FormField, Input, Select } from "@/components/ui/FormControls";
import { GuardianFieldSet, emptyGuardian } from "@/features/guardians/components/GuardianFieldSet";
import type { WizardGuardian, WizardState } from "../types";

const RELATIONSHIPS: { value: GuardianRelationship; label: string }[] = [
  { value: "FATHER", label: "Father" },
  { value: "MOTHER", label: "Mother" },
  { value: "GUARDIAN", label: "Guardian" },
  { value: "OTHER", label: "Other" },
];

export function GuardianStep({
  schoolId,
  state,
  onChange,
}: {
  schoolId: string;
  state: WizardState;
  onChange: (patch: Partial<WizardState>) => void;
}) {
  const [adding, setAdding] = useState(false);

  function addGuardian(g: WizardGuardian) {
    onChange({ guardians: [...state.guardians, g] });
    setAdding(false);
  }

  function removeGuardian(key: string) {
    onChange({ guardians: state.guardians.filter((g) => g.key !== key) });
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-sm font-semibold text-foreground">Parent / guardian</h2>
        <p className="mt-0.5 text-sm text-foreground-soft">
          Search for a parent who already has another child enrolled, or create a new one. Optional — you can add
          this later from the student&apos;s profile.
        </p>
      </div>

      {state.guardians.length === 0 && !adding ? (
        <EmptyState icon={Users} title="No guardians added yet" />
      ) : (
        <div className="space-y-2">
          {state.guardians.map((g) => (
            <Card key={g.key} padding="sm">
              <div className="flex items-center justify-between p-2">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-foreground">
                      {g.firstName} {g.lastName}
                    </p>
                    <Badge tone={g.mode === "existing" ? "accent" : "neutral"}>
                      {g.mode === "existing" ? "Existing guardian" : "New guardian"}
                    </Badge>
                    {g.isPrimaryContact && <Badge tone="success">Primary</Badge>}
                  </div>
                  <p className="text-sm text-foreground-soft">
                    {RELATIONSHIPS.find((r) => r.value === g.relationship)?.label}
                    {g.phone && ` · ${g.phone}`}
                  </p>
                </div>
                <button
                  onClick={() => removeGuardian(g.key)}
                  className="rounded-lg p-1.5 text-foreground-muted hover:bg-danger-soft hover:text-danger"
                  aria-label="Remove guardian"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {adding ? (
        <AddGuardianPanel schoolId={schoolId} onAdd={addGuardian} onCancel={() => setAdding(false)} />
      ) : (
        <Button variant="outline" size="sm" icon={<Plus className="size-4" />} onClick={() => setAdding(true)}>
          Add guardian
        </Button>
      )}
    </div>
  );
}

function AddGuardianPanel({
  schoolId,
  onAdd,
  onCancel,
}: {
  schoolId: string;
  onAdd: (g: WizardGuardian) => void;
  onCancel: () => void;
}) {
  const [mode, setMode] = useState<"search" | "new">("search");

  return (
    <Card>
      <div className="mb-4 flex gap-1 rounded-lg bg-surface p-1">
        <button
          type="button"
          onClick={() => setMode("search")}
          className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
            mode === "search" ? "bg-background text-foreground shadow-sm" : "text-foreground-soft"
          }`}
        >
          <Search className="mr-1.5 inline size-3.5" />
          Search existing
        </button>
        <button
          type="button"
          onClick={() => setMode("new")}
          className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
            mode === "new" ? "bg-background text-foreground shadow-sm" : "text-foreground-soft"
          }`}
        >
          <UserPlus className="mr-1.5 inline size-3.5" />
          Create new
        </button>
      </div>

      {mode === "search" ? (
        <SearchExistingGuardian schoolId={schoolId} onAdd={onAdd} onCancel={onCancel} />
      ) : (
        <CreateNewGuardian onAdd={onAdd} onCancel={onCancel} />
      )}
    </Card>
  );
}

function SearchExistingGuardian({
  schoolId,
  onAdd,
  onCancel,
}: {
  schoolId: string;
  onAdd: (g: WizardGuardian) => void;
  onCancel: () => void;
}) {
  const { accessToken } = useAuth();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GuardianSearchResult[]>([]);
  const [selected, setSelected] = useState<GuardianSearchResult | null>(null);
  const [relationship, setRelationship] = useState<GuardianRelationship>("FATHER");
  const [isPrimaryContact, setIsPrimaryContact] = useState(false);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (!accessToken || query.trim().length < 2) return;
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

  const visibleResults = query.trim().length < 2 ? [] : results;

  if (selected) {
    return (
      <div className="space-y-4">
        <div className="rounded-lg border border-accent bg-accent-soft px-3 py-2">
          <p className="text-sm font-medium text-foreground">
            {selected.firstName} {selected.lastName}
          </p>
          <p className="text-xs text-foreground-soft">{selected.phone ?? selected.email ?? "No contact on file"}</p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Relationship" required>
            <Select value={relationship} onChange={(e) => setRelationship(e.target.value as GuardianRelationship)}>
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
        <div className="flex gap-2">
          <Button
            size="sm"
            onClick={() =>
              onAdd({
                key: crypto.randomUUID(),
                mode: "existing",
                guardianId: selected.id,
                firstName: selected.firstName,
                lastName: selected.lastName,
                phone: selected.phone ?? "",
                email: selected.email ?? "",
                relationship,
                isPrimaryContact,
              })
            }
          >
            Add {selected.firstName}
          </Button>
          <Button size="sm" variant="outline" onClick={() => setSelected(null)}>
            Back to search
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-foreground-muted" />
        <Input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name, phone, or email…"
          className="pl-9"
        />
      </div>
      {query.trim().length >= 2 && (
        <div className="max-h-56 space-y-1 overflow-y-auto">
          {searching ? (
            <p className="px-1 py-2 text-sm text-foreground-muted">Searching…</p>
          ) : visibleResults.length === 0 ? (
            <p className="px-1 py-2 text-sm text-foreground-muted">
              No matching guardian in this school. Try Create new instead.
            </p>
          ) : (
            visibleResults.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => setSelected(r)}
                className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm hover:bg-surface-hover"
              >
                <span className="font-medium text-foreground">
                  {r.firstName} {r.lastName}
                </span>
                <span className="text-foreground-muted">{r.phone ?? r.email ?? ""}</span>
              </button>
            ))
          )}
        </div>
      )}
      <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
        Cancel
      </Button>
    </div>
  );
}

function CreateNewGuardian({
  onAdd,
  onCancel,
}: {
  onAdd: (g: WizardGuardian) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(emptyGuardian());

  return (
    <div className="space-y-4">
      <GuardianFieldSet value={value} onChange={setValue} />
      <div className="flex gap-2">
        <Button
          type="button"
          size="sm"
          disabled={!value.firstName.trim() || !value.lastName.trim()}
          onClick={() =>
            onAdd({
              key: crypto.randomUUID(),
              mode: "new",
              firstName: value.firstName,
              lastName: value.lastName,
              phone: value.phone ?? "",
              email: value.email ?? "",
              relationship: value.relationship,
              isPrimaryContact: value.isPrimaryContact ?? false,
            })
          }
        >
          Add guardian
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
