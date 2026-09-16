import Link from "next/link";
import { BookOpen, Check, ChevronRight, Layers, Rows3, School as SchoolIcon } from "lucide-react";
import { Card } from "@/components/ui/Card";
import type { TeachingSchool } from "../schoolGrouping";
import { SchoolTypeBadge } from "./SchoolTypeBadge";

// One school = one card, always labeled by its own real name and type — a
// teacher assigned to both a Primary and a Secondary school sees two
// clearly distinct cards here, never a merged or ambiguous "combined" view.
// `selected` is purely a visual affordance (e.g. the one school a
// single-school teacher is automatically shown) — it never changes what
// the link points at or what data loads; that's still entirely driven by
// TeacherAssignment on the backend.
export function SchoolCard({ school, selected = false }: { school: TeachingSchool; selected?: boolean }) {
  return (
    <Link href={`/my-classes/${school.id}`}>
      <Card
        className={`flex items-center gap-4 transition-all hover:shadow-md ${
          selected ? "border-accent bg-accent-soft/30 ring-1 ring-accent/30" : "hover:border-accent hover:bg-accent-soft/40"
        }`}
      >
        <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent">
          <SchoolIcon className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate text-sm font-semibold text-foreground">{school.name}</h3>
            <SchoolTypeBadge type={school.type} />
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-foreground-soft">
            <span className="inline-flex items-center gap-1">
              <Layers className="size-3.5 text-foreground-muted" />
              {school.classCount} {school.classCount === 1 ? "class" : "classes"}
            </span>
            <span className="inline-flex items-center gap-1">
              <Rows3 className="size-3.5 text-foreground-muted" />
              {school.sectionCount} {school.sectionCount === 1 ? "section" : "sections"}
            </span>
            <span className="inline-flex items-center gap-1">
              <BookOpen className="size-3.5 text-foreground-muted" />
              {school.subjectCount} {school.subjectCount === 1 ? "subject" : "subjects"}
            </span>
          </div>
        </div>
        {selected ? (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-success-soft px-2.5 py-1 text-xs font-medium text-success">
            <Check className="size-3.5" /> Selected
          </span>
        ) : (
          <ChevronRight className="size-5 shrink-0 text-foreground-muted" />
        )}
      </Card>
    </Link>
  );
}
