"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, Eye } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { CATEGORY_LABELS, COLUMN_DEFS, ALL_OPTIONAL_COLUMN_IDS, DEFAULT_VISIBLE_COLUMNS, type ColumnCategory } from "./columns";

const CATEGORY_ORDER: ColumnCategory[] = ["STUDENT", "PARENT", "FEES", "ATTENDANCE", "ACADEMIC"];

// A permanent, always-visible section above the table — NOT a popup, drawer,
// or modal, per the approved Student List design. Toggling a checkbox
// applies immediately (no separate "Apply" step), matching how every other
// filter on this page already behaves live.
export function VisibleColumnsSection({
  visibleColumns,
  onChange,
}: {
  visibleColumns: string[];
  onChange: (columns: string[]) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const selected = new Set(visibleColumns);

  function toggle(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange([...next]);
  }

  return (
    <div className="rounded-xl border border-border bg-background shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-4">
        <div className="flex items-start gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">
            <Eye className="size-4.5" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-foreground">Visible Columns</h2>
            <p className="text-xs text-foreground-muted">Select additional columns to display (core student information is always visible)</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => onChange(ALL_OPTIONAL_COLUMN_IDS)}>
            Show All
          </Button>
          <Button variant="outline" size="sm" onClick={() => onChange(DEFAULT_VISIBLE_COLUMNS)}>
            Default
          </Button>
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-label={expanded ? "Collapse Visible Columns" : "Expand Visible Columns"}
            aria-expanded={expanded}
            className="flex size-8 items-center justify-center rounded-lg text-foreground-soft hover:bg-surface-hover hover:text-foreground"
          >
            {expanded ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="grid grid-cols-2 gap-x-6 gap-y-5 p-4 sm:grid-cols-3 xl:grid-cols-5">
          {CATEGORY_ORDER.map((category) => {
            const columns = COLUMN_DEFS.filter((c) => c.category === category);
            return (
              <div key={category}>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-foreground-muted">{CATEGORY_LABELS[category]}</h3>
                <div className="space-y-2">
                  {columns.map((c) => (
                    <label key={c.id} className="flex cursor-pointer items-center gap-2 text-sm text-foreground">
                      <input
                        type="checkbox"
                        checked={selected.has(c.id)}
                        onChange={() => toggle(c.id)}
                        className="size-4 rounded border-border text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
                      />
                      {c.label}
                    </label>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
