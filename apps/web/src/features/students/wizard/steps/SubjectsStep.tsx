"use client";

import { useEffect, useState } from "react";
import { BookOpen, UserSquare2 } from "lucide-react";
import { api, type ClassSubjectRecord, type SectionTeacherAssignment } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { SkeletonCards } from "@/components/ui/Skeleton";
import type { WizardState } from "../types";

export function SubjectsStep({ schoolId, state }: { schoolId: string; state: WizardState }) {
  const { accessToken } = useAuth();
  const [subjectsByClass, setSubjectsByClass] = useState<Record<string, ClassSubjectRecord[]>>({});
  const [assignmentsByKey, setAssignmentsByKey] = useState<Record<string, SectionTeacherAssignment[]>>({});

  useEffect(() => {
    if (!accessToken || !state.classId || subjectsByClass[state.classId]) return;
    api
      .listClassSubjects(accessToken, schoolId, state.classId)
      .then((data) => setSubjectsByClass((prev) => ({ ...prev, [state.classId]: data })))
      .catch(() => setSubjectsByClass((prev) => ({ ...prev, [state.classId]: [] })));
  }, [accessToken, schoolId, state.classId, subjectsByClass]);

  const assignmentsKey = `${state.classId}:${state.sectionId}:${state.academicYearId}`;
  useEffect(() => {
    if (!accessToken || !state.classId || !state.sectionId || !state.academicYearId) return;
    if (assignmentsByKey[assignmentsKey]) return;
    api
      .listSectionTeacherAssignments(accessToken, schoolId, state.classId, state.sectionId, state.academicYearId)
      .then((data) => setAssignmentsByKey((prev) => ({ ...prev, [assignmentsKey]: data })))
      .catch(() => setAssignmentsByKey((prev) => ({ ...prev, [assignmentsKey]: [] })));
  }, [accessToken, schoolId, state.classId, state.sectionId, state.academicYearId, assignmentsKey, assignmentsByKey]);

  const subjects = state.classId ? (subjectsByClass[state.classId] ?? null) : [];
  const assignments = assignmentsByKey[assignmentsKey] ?? null;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-sm font-semibold text-foreground">Subjects &amp; teachers</h2>
        <p className="mt-0.5 text-sm text-foreground-soft">
          Determined automatically by the class this student is joining — nothing to choose here.
        </p>
      </div>

      <section>
        <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-foreground-muted">
          <BookOpen className="size-3.5" /> Student subjects
        </h3>
        {!subjects ? (
          <SkeletonCards count={3} />
        ) : subjects.length === 0 ? (
          <EmptyState title="No subjects configured" description="This class has no subjects set up yet." />
        ) : (
          <div className="flex flex-wrap gap-2">
            {subjects.map((cs) => (
              <Badge key={cs.subjectId}>{cs.subject.name}</Badge>
            ))}
          </div>
        )}
      </section>

      <section>
        <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-foreground-muted">
          <UserSquare2 className="size-3.5" /> Teachers
        </h3>
        {!assignments ? (
          <SkeletonCards count={2} />
        ) : assignments.length === 0 ? (
          <EmptyState
            title="No teachers assigned yet"
            description="Once a teacher is assigned to this section's subjects, they'll show up here automatically."
          />
        ) : (
          <div className="flex flex-wrap gap-2">
            {assignments.map((a) => (
              <Badge key={a.id} tone="accent">
                {a.subject.name} — {a.teacher.firstName} {a.teacher.lastName}
              </Badge>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
