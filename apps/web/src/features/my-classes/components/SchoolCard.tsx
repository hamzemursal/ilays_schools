import Link from "next/link";
import { ChevronRight, School as SchoolIcon } from "lucide-react";
import { Card } from "@/components/ui/Card";
import type { TeachingSchool } from "../schoolGrouping";
import { SchoolTypeBadge } from "./SchoolTypeBadge";

// One school = one card, always labeled by its own real name and type — a
// teacher assigned to both a Primary and a Secondary school sees two
// clearly distinct cards here, never a merged or ambiguous "combined" view.
export function SchoolCard({ school }: { school: TeachingSchool }) {
  return (
    <Link href={`/my-classes/${school.id}`}>
      <Card className="flex items-center gap-4 transition-colors hover:border-accent hover:bg-accent-soft/40">
        <div className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">
          <SchoolIcon className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate text-sm font-semibold text-foreground">{school.name}</h3>
            <SchoolTypeBadge type={school.type} />
          </div>
          <p className="mt-1 text-xs text-foreground-soft">
            {school.classCount} {school.classCount === 1 ? "class" : "classes"} ·{" "}
            {school.sectionCount} {school.sectionCount === 1 ? "section" : "sections"} ·{" "}
            {school.subjectCount} {school.subjectCount === 1 ? "subject" : "subjects"}
          </p>
        </div>
        <ChevronRight className="size-5 shrink-0 text-foreground-muted" />
      </Card>
    </Link>
  );
}
