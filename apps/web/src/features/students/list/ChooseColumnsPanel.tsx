"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Columns3, Search, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/FormControls";
import { CATEGORY_LABELS, COLUMN_DEFS, DEFAULT_VISIBLE_COLUMNS, type ColumnCategory } from "./columns";

const CATEGORY_ORDER: ColumnCategory[] = ["STUDENT", "ACADEMIC", "FINANCE", "PARENT"];

// A compact popover anchored to its own trigger button, matching this app's
// other dropdown pattern (ExportMenu, ActionsMenu) — not a full-height
// drawer, so the table stays visible behind it. Below `sm` there's no room
// to anchor a 340px panel under the button without it running off-screen,
// so it centers as a small modal instead.
export function ChooseColumnsPanel({
  visibleColumns,
  onApply,
}: {
  visibleColumns: string[];
  onApply: (columns: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Set<string>>(new Set(visibleColumns));
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  // Re-seed the draft from whatever's actually applied every time the panel
  // opens, so a previous unsaved edit never leaks in if it's reopened later.
  useEffect(() => {
    if (open) {
      setDraft(new Set(visibleColumns));
      setQuery("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onMouseDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return COLUMN_DEFS;
    return COLUMN_DEFS.filter((c) => c.label.toLowerCase().includes(q));
  }, [query]);

  function toggle(id: string) {
    setDraft((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function apply() {
    onApply([...draft]);
    setOpen(false);
  }

  return (
    <div ref={ref} className="relative inline-block">
      <Button variant="outline" size="sm" icon={<Columns3 className="size-4" />} onClick={() => setOpen((v) => !v)}>
        Choose Columns
      </Button>

      {open && (
        <div
          className="fixed inset-0 z-30 flex items-start justify-center bg-foreground/20 p-4 pt-24 sm:static sm:inset-auto sm:z-auto sm:block sm:bg-transparent sm:p-0"
          onClick={() => setOpen(false)}
        >
          <div
            role="dialog"
            aria-label="Choose Columns"
            onClick={(e) => e.stopPropagation()}
            className="flex max-h-[560px] w-full max-w-[340px] flex-col rounded-xl border border-border bg-background shadow-lg sm:absolute sm:right-0 sm:top-full sm:mt-1.5 sm:w-[340px] sm:max-w-none"
          >
            <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-3">
              <h2 className="text-sm font-semibold text-foreground">Choose Columns</h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="rounded-lg p-1 text-foreground-muted hover:bg-surface-hover hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="shrink-0 border-b border-border p-3">
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-foreground-muted" />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search columns…"
                  className="pl-8 text-sm"
                  aria-label="Search columns"
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-3">
              {CATEGORY_ORDER.map((category) => {
                const columns = filtered.filter((c) => c.category === category);
                if (columns.length === 0) return null;
                return (
                  <div key={category} className="mb-4">
                    <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-foreground-muted">
                      {CATEGORY_LABELS[category]}
                    </h3>
                    <div className="space-y-0.5">
                      {columns.map((c) => (
                        <label
                          key={c.id}
                          className="flex cursor-pointer items-center justify-between rounded-lg px-2 py-1.5 text-sm hover:bg-surface-hover"
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

            <div className="flex shrink-0 items-center justify-between gap-2 border-t border-border p-3">
              <Button variant="outline" size="sm" onClick={() => setDraft(new Set(DEFAULT_VISIBLE_COLUMNS))}>
                Reset to Default
              </Button>
              <Button size="sm" onClick={apply}>
                Apply Columns
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
