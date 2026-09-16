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
      <Card padding="none">
        <CardHeader title="My classes" description={`Every class and section you teach at ${school.name}, by academic year.`} />
        <div className="space-y-4 p-5">
          {byYear.map((yearGroup) => (
            <div key={yearGroup.academicYearId}>
              <p className="text-xs font-semibold uppercase tracking-wide text-foreground-muted">{yearGroup.academicYearName}</p>
              <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {yearGroup.assignments.map((a) => (
                  <Card
                    key={a.id}
                    className="group cursor-pointer transition-all hover:border-accent hover:shadow-md"
                    onClick={() => router.push(`/my-classes/${schoolId}/${a.id}`)}
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">
                        <Layers className="size-4.5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-foreground">
                          {a.section.class.name} · {a.section.name}
                        </p>
                        <p className="text-sm text-foreground-soft">{a.subject.name}</p>
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

      <Card padding="none">
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
                    className="cursor-pointer transition-all hover:border-accent hover:shadow-md"
                    onClick={() => router.push(`/my-classes/${schoolId}/${a.id}`)}
                  >
                    <p className="font-medium text-foreground">
                      {a.section.class.name} · {a.section.name}
                    </p>
                    <p className="text-sm text-foreground-soft">{a.academicYear.name}</p>
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
