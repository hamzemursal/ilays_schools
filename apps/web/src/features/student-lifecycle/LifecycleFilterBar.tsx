"use client";

import { RotateCcw, Search, X } from "lucide-react";
import { Input, Select } from "@/components/ui/FormControls";
import { Button } from "@/components/ui/Button";
import type { AcademicYear } from "@/lib/api";

// School filter is omitted entirely on a fixed-school page (School Admin) —
// same convention as AuditFilterBar. Academic Year only becomes a real
// dropdown once a specific school is selected: AcademicYear rows are
// per-school (see schema), so there's no single cross-school list of years
// to offer while "All Schools" is active — the control reflects that real
// constraint instead of faking a merged year list.
export function LifecycleFilterBar({
  search,
  onSearchChange,
  schools,
  schoolId,
  onSchoolChange,
  academicYears,
  academicYearId,
  onAcademicYearChange,
  onReset,
}: {
  search?: string;
  onSearchChange?: (value: string) => void;
  schools?: { id: string; name: string }[];
  schoolId: string;
  onSchoolChange: (id: string) => void;
  academicYears: AcademicYear[];
  academicYearId: string;
  onAcademicYearChange: (id: string) => void;
  onReset: () => void;
}) {
  return (
    <div className="flex flex-wrap items-end gap-2.5">
      {onSearchChange && (
        <div className="relative w-full max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-foreground-muted" />
          <Input
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search by student name or ID…"
            className="!bg-surface pl-9 pr-9"
          />
          {search && (
            <button
              type="button"
              onClick={() => onSearchChange("")}
              aria-label="Clear search"
              className="absolute right-2.5 top-1/2 flex size-5 -translate-y-1/2 items-center justify-center rounded-full text-foreground-muted hover:bg-surface-hover hover:text-foreground"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>
      )}

      {schools && (
        <div>
          <label className="mb-1 block text-xs font-medium text-foreground-soft">School</label>
          <Select value={schoolId} onChange={(e) => onSchoolChange(e.target.value)} className="w-48">
            <option value="">All schools</option>
            {schools.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </div>
      )}

      <div>
        <label className="mb-1 block text-xs font-medium text-foreground-soft">Academic Year</label>
        <Select
          value={academicYearId}
          onChange={(e) => onAcademicYearChange(e.target.value)}
          className="w-40"
          disabled={!schoolId}
        >
          <option value="">All academic years</option>
          {academicYears.map((y) => (
            <option key={y.id} value={y.id}>
              {y.name}
              {y.isCurrent ? " (current)" : ""}
            </option>
          ))}
        </Select>
        {!schoolId && schools && <p className="mt-1 text-xs text-foreground-muted">Pick a school to filter by year</p>}
      </div>

      <Button size="sm" variant="outline" icon={<RotateCcw className="size-4" />} onClick={onReset}>
        Reset
      </Button>
    </div>
  );
}
