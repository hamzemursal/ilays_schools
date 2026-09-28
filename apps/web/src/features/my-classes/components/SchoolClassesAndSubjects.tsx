"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRight, ClipboardCheck, Layers } from "lucide-react";
import type { TeacherAssignmentRecord } from "@/lib/api";
import { groupAssignmentsBySubject, groupAssignmentsByYear, type TeachingSchool } from "../schoolGrouping";
import { Card, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

// The "My classes" (by year) + "My subjects" (by subject) pair for exactly
// one school — shared between the dedicated /my-classes/[schoolId] page and
// /my-classes itself, which renders this inline (no extra click) for a
// teacher with exactly one school. Always scoped to `school.assignments`,
// so it can never render a second school's classes no matter which page
// it's used from.
// One color per class·section (category only, never a status), so the same
// class looks the same wherever it appears on the page.
const CLASS_TONES = [
  { bar: "bg-accent", soft: "bg-accent-soft", text: "text-accent" },
  { bar: "bg-violet-500", soft: "bg-violet-50", text: "text-violet-700" },
  { bar: "bg-teal-500", soft: "bg-teal-50", text: "text-teal-700" },
  { bar: "bg-amber-500", soft: "bg-amber-50", text: "text-amber-700" },
  { bar: "bg-rose-500", soft: "bg-rose-50", text: "text-rose-700" },
  { bar: "bg-emerald-500", soft: "bg-emerald-50", text: "text-emerald-700" },
] as const;

export function SchoolClassesAndSubjects({
  school,
  schoolId,
  canMarkAttendance,
}: {
  school: TeachingSchool;
  schoolId: string;
  canMarkAttendance: boolean;
}) {
  const router = useRouter();
  const byYear = groupAssignmentsByYear(school.assignments);
  const bySubject = groupAssignmentsBySubject(school.assignments);
  const today = new Date().toISOString().slice(0, 10);
  const sectionOrder = [...new Map(school.assignments.map((a) => [a.section.id, `${a.section.class.name} ${a.section.name}`])).entries()]
    .sort((x, y) => x[1].localeCompare(y[1], undefined, { numeric: true }))
    .map(([id]) => id);
  const toneOf = (sectionId: string) => CLASS_TONES[Math.max(0, sectionOrder.indexOf(sectionId)) % CLASS_TONES.length];

  function attendanceUrl(a: TeacherAssignmentRecord) {
    const p = new URLSearchParams({
      date: today,
      year: a.academicYear.name,
      class: a.section.class.name,
      section: a.section.name,
      subject: a.subject.name,
    });
    return `/schools/${a.schoolId}/sections/${a.section.id}/attendance?${p.toString()}`;
  }

  return (
    <>
      <Card padding="none" className="rounded-2xl">
        <CardHeader title="My classes" description={`Every class and section you teach at ${school.name}, by academic year.`} />
        <div className="space-y-4 p-5">
          {byYear.map((yearGroup) => (
            <div key={yearGroup.academicYearId}>
              <p className="text-xs font-semibold uppercase tracking-wide text-foreground-muted">{yearGroup.academicYearName}</p>
              <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {yearGroup.assignments.map((a) => (
                  <Card
                    key={a.id}
                    className="group relative cursor-pointer overflow-hidden rounded-2xl transition-all hover:-translate-y-0.5 hover:border-accent/40 hover:shadow-md"
                    onClick={() => router.push(`/my-classes/${schoolId}/${a.id}`)}
                  >
                    <span className={`absolute inset-y-0 left-0 w-1.5 ${toneOf(a.section.id).bar}`} aria-hidden />
                    <div className="flex items-start gap-3">
                      <div className={`flex size-11 shrink-0 items-center justify-center rounded-xl ${toneOf(a.section.id).soft} ${toneOf(a.section.id).text}`}>
                        <Layers className="size-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-base font-semibold text-foreground">
                          {a.section.class.name} · {a.section.name}
                        </p>
                        <span className={`mt-1 inline-flex rounded-md px-2 py-0.5 text-xs font-semibold ${toneOf(a.section.id).soft} ${toneOf(a.section.id).text}`}>
                          {a.subject.name}
                        </span>
                      </div>
                    </div>
                    <div className="mt-3 flex items-center justify-between gap-2">
                      {canMarkAttendance ? (
                        <Link href={attendanceUrl(a)} onClick={(e) => e.stopPropagation()} className="inline-flex">
                          <Button size="sm" variant="outline" icon={<ClipboardCheck className="size-4" />}>
                            Mark attendance
                          </Button>
                        </Link>
                      ) : (
                        <span />
                      )}
                      <span className="inline-flex items-center gap-0.5 text-xs font-medium text-accent opacity-0 transition-opacity group-hover:opacity-100">
                        View details <ChevronRight className="size-3.5" />
                      </span>
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card padding="none" className="rounded-2xl">
        <CardHeader title="My subjects" description={`Every subject you teach at ${school.name}, across your classes.`} />
        <div className="space-y-4 p-5">
          {bySubject.map((subjectGroup) => (
            <div key={subjectGroup.subjectId}>
              <p className="text-xs font-semibold uppercase tracking-wide text-foreground-muted">{subjectGroup.subjectName}</p>
              <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {subjectGroup.assignments.map((a) => (
                  <Card
                    key={a.id}
                    padding="sm"
                    className="flex cursor-pointer items-center gap-3 rounded-xl transition-all hover:border-accent/40 hover:shadow-md"
                    onClick={() => router.push(`/my-classes/${schoolId}/${a.id}`)}
                  >
                    <span className={`size-2.5 shrink-0 rounded-full ${toneOf(a.section.id).bar}`} aria-hidden />
                    <div className="min-w-0">
                    <p className="font-medium text-foreground">
                      {a.section.class.name} · {a.section.name}
                    </p>
                    <p className="text-sm text-foreground-soft">{a.academicYear.name}</p>
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Card>
    </>
  );
}
