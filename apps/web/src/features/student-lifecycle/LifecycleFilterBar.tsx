"use client";

import { RotateCcw, Search, X } from "lucide-react";
import { Input, Select } from "@/components/ui/FormControls";
import { Button } from "@/components/ui/Button";
import type { LifecycleYearOption } from "./useLifecycleYearFilter";

// School filter is omitted entirely on a fixed-school page (School Admin) —
// same convention as AuditFilterBar. Academic Year stays enabled either
// way: while "All Schools" is active, its options are the real distinct
// AcademicYear names across every accessible school (see
// useLifecycleYearFilter), so the control never looks broken or disabled —
// it just switches what "the year" means, from one school's own row to a
// name shared across schools.
export function LifecycleFilterBar({
  search,
  onSearchChange,
  schools,
  schoolId,
  onSchoolChange,
  academicYearOptions,
  academicYearValue,
  onAcademicYearChange,
  onReset,
}: {
  search?: string;
  onSearchChange?: (value: string) => void;
  schools?: { id: string; name: string }[];
  schoolId: string;
  onSchoolChange: (id: string) => void;
  academicYearOptions: LifecycleYearOption[];
  academicYearValue: string;
  onAcademicYearChange: (value: string) => void;
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
        <Select value={academicYearValue} onChange={(e) => onAcademicYearChange(e.target.value)} className="w-40">
          <option value="">All academic years</option>
          {academicYearOptions.map((y) => (
            <option key={y.value} value={y.value}>
              {y.label}
            </option>
          ))}
        </Select>
      </div>

      <Button size="sm" variant="outline" icon={<RotateCcw className="size-4" />} onClick={onReset}>
        Reset
      </Button>
    </div>
  );
}
