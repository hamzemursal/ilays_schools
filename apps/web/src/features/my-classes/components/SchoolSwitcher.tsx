"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Check, School as SchoolIcon } from "lucide-react";
import type { TeachingSchool } from "../schoolGrouping";

// Lets a teacher jump between their own schools without going back through
// /my-classes. Only rendered by the caller when there are 2+ schools —
// with exactly one school, switching has nothing to switch to.
export function SchoolSwitcher({ schools, currentSchoolId }: { schools: TeachingSchool[]; currentSchoolId: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const current = schools.find((s) => s.id === currentSchoolId);

  return (
    <div ref={ref} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-surface-hover"
      >
        <SchoolIcon className="size-4 text-foreground-soft" />
        <span className="max-w-[180px] truncate">{current?.name ?? "Switch school"}</span>
        <ChevronDown className="size-4 text-foreground-muted" />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 z-10 mt-1 min-w-[240px] rounded-lg border border-border bg-background py-1 shadow-lg"
        >
          {schools.map((school) => (
            <button
              key={school.id}
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                if (school.id !== currentSchoolId) router.push(`/my-classes/${school.id}`);
              }}
              className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-surface-hover"
            >
              <span className="min-w-0 truncate">{school.name}</span>
              {school.id === currentSchoolId && <Check className="size-4 shrink-0 text-accent" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
