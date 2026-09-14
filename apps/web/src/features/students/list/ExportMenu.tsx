"use client";

import { useEffect, useRef, useState } from "react";
import { Download, Printer } from "lucide-react";
import { Button } from "@/components/ui/Button";

// A small "..." style dropdown, matching this app's existing hand-built
// overlay pattern (ActionsMenu, ConfirmDialog) — no dropdown primitive
// exists yet, so this follows the same no-dependency shape.
export function ExportMenu({
  loading,
  selectedCount,
  onExportCurrentView,
  onExportAllFiltered,
  onExportSelected,
  onPrint,
}: {
  loading?: boolean;
  selectedCount: number;
  onExportCurrentView: () => void;
  onExportAllFiltered: () => void;
  onExportSelected: () => void;
  onPrint: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  function pick(action: () => void) {
    setOpen(false);
    action();
  }

  return (
    <div ref={ref} className="relative inline-block">
      <Button variant="outline" icon={<Download className="size-4" />} loading={loading} onClick={() => setOpen((v) => !v)}>
        Export
      </Button>
      {open && (
        <div role="menu" className="absolute right-0 z-10 mt-1 min-w-[220px] rounded-lg border border-border bg-background py-1 shadow-lg">
          <button
            type="button"
            role="menuitem"
            onClick={() => pick(onExportCurrentView)}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-foreground hover:bg-surface-hover"
          >
            Export Current View
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => pick(onExportAllFiltered)}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-foreground hover:bg-surface-hover"
          >
            Export All Filtered Students
          </button>
          {selectedCount > 0 && (
            <button
              type="button"
              role="menuitem"
              onClick={() => pick(onExportSelected)}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-foreground hover:bg-surface-hover"
            >
              Export Selected Students ({selectedCount})
            </button>
          )}
          <div className="my-1 border-t border-border" />
          <button
            type="button"
            role="menuitem"
            onClick={() => pick(onPrint)}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-foreground hover:bg-surface-hover"
          >
            <Printer className="size-3.5" /> Print Current View
          </button>
        </div>
      )}
    </div>
  );
}
