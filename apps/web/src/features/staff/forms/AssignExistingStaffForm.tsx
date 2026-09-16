"use client";

import { useEffect, useState } from "react";
import { Search, UserPlus } from "lucide-react";
import { api, type Department, type StaffSearchResult } from "@/lib/api";
import { ApiError } from "@/lib/auth-context";
import { staffApi } from "../api";
import { SchoolTypeBadge } from "@/features/my-classes/components/SchoolTypeBadge";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { FormField, Input, Select } from "@/components/ui/FormControls";

// Search-existing-staff-across-the-org first, same duplicate-prevention
// shape already proven for teachers (AssignExistingTeacherForm) and
// parents/guardians (GuardianForm) — a staff member's Staff row lives at
// one home school (Staff.userId is unique), so this is the only correct
// way to have them also work at a second school. "Add staff member"
// always creates a brand-new person and must never be used for someone
// who already has a profile elsewhere in the organization.
export function AssignExistingStaffForm({
  accessToken,
  schoolId,
  onAssigned,
  onCancel,
}: {
  accessToken: string;
  schoolId: string;
  onAssigned: (staffId: string) => void;
  onCancel: () => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<StaffSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<StaffSearchResult | null>(null);

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }
    const handle = setTimeout(() => {
      setSearching(true);
      staffApi
        .search(accessToken, schoolId, query)
        .then(setResults)
        .catch(() => setResults([]))
        .finally(() => setSearching(false));
    }, 300);
    return () => clearTimeout(handle);
  }, [accessToken, schoolId, query]);

  if (selected) {
    return (
      <AssignPicker accessToken={accessToken} schoolId={schoolId} staff={selected} onAssigned={onAssigned} onBack={() => setSelected(null)} />
    );
  }

  const searched = query.trim().length >= 2;

  return (
    <div className="rounded-xl border border-border bg-surface-soft p-4">
      <h3 className="text-sm font-semibold text-foreground">Assign existing staff member</h3>
      <p className="mt-0.5 text-xs text-foreground-soft">
        Search across the whole organization — for a staff member who already works at another school.
      </p>
      <div className="relative mt-2">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-foreground-muted" />
        <Input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name, staff number, or email…"
          className="pl-9"
        />
      </div>

      {searched && (
        <div className="mt-3 space-y-1.5">
          {searching ? (
            <p className="px-1 py-2 text-sm text-foreground-muted">Searching…</p>
          ) : results.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border p-4 text-center">
              <p className="text-sm text-foreground-muted">No matching staff member found in this organization.</p>
              <p className="mt-1 text-xs text-foreground-muted">
                If this is a brand-new person, use "Add staff member" instead.
              </p>
            </div>
          ) : (
            results.map((r) => (
              <div key={r.id} className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background p-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium text-foreground">
                      {r.firstName} {r.lastName}
                    </p>
                    {r.staffCode && <span className="font-mono text-xs font-medium text-accent">{r.staffCode}</span>}
                    <SchoolTypeBadge type={r.school.type} />
                  </div>
                  <p className="truncate text-sm text-foreground-soft">
                    #{r.staffNumber} · {r.school.name}
                  </p>
                </div>
                <Button size="sm" variant="outline" icon={<UserPlus className="size-4" />} onClick={() => setSelected(r)}>
                  Select
                </Button>
              </div>
            ))
          )}
        </div>
      )}

      <div className="mt-4">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

function AssignPicker({
  accessToken,
  schoolId,
  staff,
  onAssigned,
  onBack,
}: {
  accessToken: string;
  schoolId: string;
  staff: StaffSearchResult;
  onAssigned: (staffId: string) => void;
  onBack: () => void;
}) {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [departmentId, setDepartmentId] = useState("");
  const [role, setRole] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.listDepartments(accessToken, schoolId).then(setDepartments);
  }, [accessToken, schoolId]);

  async function onSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      await staffApi.assignToSchool(accessToken, schoolId, staff.id, {
        departmentId: departmentId || undefined,
        role: role.trim() || undefined,
      });
      onAssigned(staff.id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to assign this staff member");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="rounded-xl border border-border bg-surface-soft p-4">
      <h3 className="text-sm font-semibold text-foreground">
        Assign {staff.firstName} {staff.lastName} to this school
      </h3>
      <div className="mt-2 flex items-center gap-2 rounded-lg border border-accent bg-accent-soft px-3 py-2">
        <p className="text-sm font-medium text-foreground">
          {staff.firstName} {staff.lastName}
        </p>
        {staff.staffCode && <span className="font-mono text-xs font-medium text-accent">{staff.staffCode}</span>}
        <SchoolTypeBadge type={staff.school.type} />
        <p className="text-xs text-foreground-soft">home school: {staff.school.name}</p>
      </div>

      <div className="mt-3 flex flex-wrap items-end gap-2">
        <FormField label="Department" className="w-auto">
          <Select value={departmentId} onChange={(e) => setDepartmentId(e.target.value)} className="w-auto">
            <option value="">No department</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label="Role at this school" className="w-auto">
          <Input value={role} onChange={(e) => setRole(e.target.value)} placeholder="e.g. Librarian" className="w-48" />
        </FormField>
      </div>

      {error && (
        <Alert tone="danger" className="mt-3">
          {error}
        </Alert>
      )}

      <div className="mt-4 flex items-center gap-2">
        <Button size="sm" icon={<UserPlus className="size-4" />} loading={submitting} onClick={onSubmit}>
          Assign to this school
        </Button>
        <Button size="sm" variant="outline" onClick={onBack}>
          Back to search
        </Button>
      </div>
    </div>
  );
}
