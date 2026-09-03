"use client";

import { Download, RotateCcw, Search, X } from "lucide-react";
import { Input, Select } from "@/components/ui/FormControls";
import { Button } from "@/components/ui/Button";
import type { AuditLogFilters } from "@/lib/api";
import {
  AUDIT_ACTIONS,
  AUDIT_MODULES,
  AUDIT_RESOURCE_TYPES,
  AUDIT_SEVERITIES,
  AUDIT_STATUSES,
  resolveDateRangePreset,
  type DateRangePreset,
} from "./constants";
import { formatActionLabel } from "./format";

const DATE_PRESETS: { value: DateRangePreset; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "last7", label: "Last 7 Days" },
  { value: "last30", label: "Last 30 Days" },
  { value: "thisMonth", label: "This Month" },
];

export function AuditFilterBar({
  search,
  onSearchChange,
  filters,
  onFilterChange,
  onReset,
  onExport,
  exporting,
  schools,
}: {
  search: string;
  onSearchChange: (value: string) => void;
  filters: AuditLogFilters;
  onFilterChange: (patch: Partial<AuditLogFilters>) => void;
  onReset: () => void;
  onExport: () => void;
  exporting: boolean;
  schools?: { id: string; name: string }[];
}) {
  return (
    <div className="space-y-3">
      <div className="relative max-w-lg">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-foreground-muted" />
        <Input
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search by actor, email, resource, action, module, or request ID…"
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

      <div className="flex flex-wrap items-end gap-2.5">
        {schools && (
          <LabeledSelect
            label="School"
            value={filters.schoolId ?? ""}
            onChange={(v) => onFilterChange({ schoolId: v || undefined })}
          >
            <option value="">All schools</option>
            {schools.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </LabeledSelect>
        )}

        <LabeledSelect label="Module" value={filters.module ?? ""} onChange={(v) => onFilterChange({ module: v || undefined })}>
          <option value="">All modules</option>
          {AUDIT_MODULES.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </LabeledSelect>

        <LabeledSelect label="Action" value={filters.action ?? ""} onChange={(v) => onFilterChange({ action: v || undefined })}>
          <option value="">All actions</option>
          {AUDIT_ACTIONS.map((a) => (
            <option key={a} value={a}>
              {formatActionLabel(a)}
            </option>
          ))}
        </LabeledSelect>

        <LabeledSelect label="Status" value={filters.status ?? ""} onChange={(v) => onFilterChange({ status: (v || undefined) as never })}>
          <option value="">All statuses</option>
          {AUDIT_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </LabeledSelect>

        <LabeledSelect
          label="Severity"
          value={filters.severity ?? ""}
          onChange={(v) => onFilterChange({ severity: (v || undefined) as never })}
        >
          <option value="">All severities</option>
          {AUDIT_SEVERITIES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </LabeledSelect>

        <LabeledSelect
          label="Resource"
          value={filters.resourceType ?? ""}
          onChange={(v) => onFilterChange({ resourceType: v || undefined })}
        >
          <option value="">All resources</option>
          {AUDIT_RESOURCE_TYPES.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </LabeledSelect>
      </div>

      <div className="flex flex-wrap items-end gap-2.5">
        <div>
          <label className="mb-1 block text-xs font-medium text-foreground-soft">Date From</label>
          <Input
            type="date"
            value={filters.dateFrom ?? ""}
            onChange={(e) => onFilterChange({ dateFrom: e.target.value || undefined })}
            className="w-40"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-foreground-soft">Date To</label>
          <Input
            type="date"
            value={filters.dateTo ?? ""}
            onChange={(e) => onFilterChange({ dateTo: e.target.value || undefined })}
            className="w-40"
          />
        </div>

        <div className="flex flex-wrap gap-1.5">
          {DATE_PRESETS.map((p) => (
            <Button key={p.value} size="sm" variant="outline" onClick={() => onFilterChange(resolveDateRangePreset(p.value))}>
              {p.label}
            </Button>
          ))}
        </div>

        <div className="ml-auto flex gap-2">
          <Button size="sm" variant="outline" icon={<RotateCcw className="size-4" />} onClick={onReset}>
            Reset
          </Button>
          <Button size="sm" variant="outline" icon={<Download className="size-4" />} loading={exporting} onClick={onExport}>
            Export CSV
          </Button>
        </div>
      </div>
    </div>
  );
}

function LabeledSelect({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-foreground-soft">{label}</label>
      <Select value={value} onChange={(e) => onChange(e.target.value)} className="w-40">
        {children}
      </Select>
    </div>
  );
}
