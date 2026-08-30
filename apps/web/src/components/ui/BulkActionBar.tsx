"use client";

import { X } from "lucide-react";
import { Button } from "./Button";

// A sticky-feeling bar that appears once at least one row is selected in a
// list — count + the bulk action(s) + a way to back out, so bulk destructive
// actions are always a deliberate, visible extra step past plain selection.
export function BulkActionBar({
  count,
  onClear,
  children,
}: {
  count: number;
  onClear: () => void;
  children: React.ReactNode;
}) {
  if (count === 0) return null;

  return (
    <div className="mb-3 flex flex-wrap items-center gap-3 rounded-lg border border-accent/30 bg-accent-soft px-4 py-2.5">
      <span className="text-sm font-medium text-accent">{count} selected</span>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
      <Button variant="ghost" size="sm" icon={<X className="size-4" />} onClick={onClear} className="ml-auto">
        Clear
      </Button>
    </div>
  );
}
