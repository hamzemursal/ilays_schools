"use client";

import { useEffect, useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/FormControls";
import { CATEGORY_LABELS, COLUMN_DEFS, DEFAULT_VISIBLE_COLUMNS, type ColumnCategory } from "./columns";

const CATEGORY_ORDER: ColumnCategory[] = ["STUDENT", "ACADEMIC", "FINANCE", "PARENT"];

// A right-side drawer, not a popover — this list runs to 20+ toggles across
// 4 categories, which needs real vertical room a small popover doesn't have.
export function ChooseColumnsPanel({
  open,
  visibleColumns,
  onApply,
  onClose,
}: {
  open: boolean;
  visibleColumns: string[];
  onApply: (columns: string[]) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<Set<string>>(new Set(visibleColumns));
  const [query, setQuery] = useState("");

  // Re-seed the draft from whatever's actually applied every time the panel
  // opens, so a previous unsaved edit never leaks in if it's reopened later.
  useEffect(() => {
    if (open) {
      setDraft(new Set(visibleColumns));
      setQuery("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return COLUMN_DEFS;
    return COLUMN_DEFS.filter((c) => c.label.toLowerCase().includes(q));
  }, [query]);

  if (!open) return null;

  function toggle(id: string) {
    setDraft((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-foreground/30" onClick={onClose}>
      <div
        role="dialog"
        aria-label="Choose Columns"
        onClick={(e) => e.stopPropagation()}
        className="flex h-full w-full max-w-sm flex-col bg-background shadow-lg"
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="text-sm font-semibold text-foreground">Choose Columns</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-1.5 text-foreground-muted hover:bg-surface-hover hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="border-b border-border p-4">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-foreground-muted" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search columns…"
              className="pl-9"
              aria-label="Search columns"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {CATEGORY_ORDER.map((category) => {
            const columns = filtered.filter((c) => c.category === category);
            if (columns.length === 0) return null;
            return (
              <div key={category} className="mb-5">
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-foreground-muted">
                  {CATEGORY_LABELS[category]}
                </h3>
                <div className="space-y-1">
                  {columns.map((c) => (
                    <label
                      key={c.id}
                      className="flex cursor-pointer items-center justify-between rounded-lg px-2 py-2 text-sm hover:bg-surface-hover"
                    >
                      <span className="text-foreground">{c.label}</span>
                      <input
                        type="checkbox"
                        checked={draft.has(c.id)}
                        onChange={() => toggle(c.id)}
                        className="size-4 rounded border-border text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
                      />
                    </label>
                  ))}
                </div>
              </div>
            );
          })}
          {filtered.length === 0 && <p className="py-6 text-center text-sm text-foreground-muted">No columns match “{query}”.</p>}
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-border p-4">
          <Button variant="outline" size="sm" onClick={() => setDraft(new Set(DEFAULT_VISIBLE_COLUMNS))}>
            Reset to Default
          </Button>
          <Button size="sm" onClick={() => onApply([...draft])}>
            Apply Columns
          </Button>
        </div>
      </div>
    </div>
  );
}
