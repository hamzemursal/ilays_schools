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
    <div className="flex items-center gap-2 border-b border-border bg-surface-soft px-4 py-2.5 sm:px-6">
      <Users className="size-4 shrink-0 text-foreground-muted" />
      <span className="shrink-0 text-sm text-foreground-soft">Selected child:</span>
      <Select
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
  );
}
