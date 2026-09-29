"use client";

import { Users } from "lucide-react";
import { Select } from "@/components/ui/FormControls";
import { useSelectedChild } from "./SelectedChildContext";

// The header-level child selector — appears on every /parent/* page so
// changing the selected child updates that page's data without navigating
// away. My Children still shows the full card grid for browsing/switching.
export function ChildSwitcher() {
  const { children, selectedChildId, setSelectedChildId, loading } = useSelectedChild();

  if (loading || children.length === 0) return null;

  return (
    <div className="px-3 pt-3 sm:px-5">
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-background px-4 py-2.5 shadow-sm">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">
        <Users className="size-4" />
      </span>
      <label htmlFor="selected-child" className="shrink-0 text-sm font-medium text-foreground-soft">
        Ilmaha la doortay:
      </label>
      <Select
        id="selected-child"
        value={selectedChildId ?? ""}
        onChange={(e) => setSelectedChildId(e.target.value)}
        className="w-auto max-w-xs"
      >
        {children.map((c) => (
          <option key={c.studentId} value={c.studentId}>
            {c.firstName} {c.lastName}
            {c.enrollment ? ` — ${c.enrollment.className} · ${c.enrollment.sectionName}` : ""}
          </option>
        ))}
      </Select>
      </div>
    </div>
  );
}
