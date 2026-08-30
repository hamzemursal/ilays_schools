"use client";

import { AlertTriangle, BookUser, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/FormControls";
import { EmptyState } from "@/components/ui/EmptyState";
import type { AcademicYear, ClassWithSections, Subject } from "@/lib/api";
import type { TeacherWizardState, WizardAssignment } from "../types";

// A teacher can only hold one assignment per (year, section, subject) — the
// backend enforces this with a unique constraint, but surfacing it here
// keeps the admin from filling out the whole wizard only to have "Create
// teacher" fail on a confusing duplicate-key error at the very end.
function duplicateKey(a: WizardAssignment) {
  return `${a.academicYearId}|${a.sectionId}|${a.subjectId}`;
}

export function findDuplicateAssignmentIndexes(assignments: WizardAssignment[]): Set<number> {
  const seen = new Map<string, number>();
  const duplicates = new Set<number>();
  assignments.forEach((a, i) => {
    const key = duplicateKey(a);
    if (seen.has(key)) {
      duplicates.add(i);
      duplicates.add(seen.get(key)!);
    } else {
      seen.set(key, i);
    }
  });
  return duplicates;
}

export function AssignmentsStep({
  state,
  onChange,
  years,
  classes,
  subjects,
}: {
  state: TeacherWizardState;
  onChange: (patch: Partial<TeacherWizardState>) => void;
  years: AcademicYear[];
  classes: ClassWithSections[];
  subjects: Subject[];
}) {
  function addRow() {
    const currentYear = years.find((y) => y.isCurrent) ?? years[0];
    const firstClass = classes[0];
    const row: WizardAssignment = {
      academicYearId: currentYear?.id ?? "",
      classId: firstClass?.id ?? "",
      sectionId: firstClass?.sections[0]?.id ?? "",
      subjectId: subjects[0]?.id ?? "",
    };
    onChange({ assignments: [...state.assignments, row] });
  }

  function updateRow(i: number, patch: Partial<WizardAssignment>) {
    onChange({ assignments: state.assignments.map((row, idx) => (idx === i ? { ...row, ...patch } : row)) });
  }

  function removeRow(i: number) {
    onChange({ assignments: state.assignments.filter((_, idx) => idx !== i) });
  }

  const canAssign = years.length > 0 && classes.length > 0 && subjects.length > 0;
  const duplicateIndexes = findDuplicateAssignmentIndexes(state.assignments);

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-sm font-semibold text-foreground">Class, section & subject assignments</h2>
        <p className="mt-0.5 text-sm text-foreground-soft">
          Optional — which academic year, class, section, and subject this teacher is assigned to. You can add more
          later from the teacher&apos;s profile.
        </p>
      </div>

      {!canAssign ? (
        <EmptyState
          icon={BookUser}
          title="Nothing to assign yet"
          description="Set up an academic year, class, and subject first, then assignments can be added here."
        />
      ) : (
        <>
          <div className="space-y-3">
            {state.assignments.map((row, i) => {
              const cls = classes.find((c) => c.id === row.classId);
              const isDuplicate = duplicateIndexes.has(i);
              return (
                <div key={i}>
                  <div
                    className={`relative grid grid-cols-2 gap-2 rounded-xl border p-3 sm:grid-cols-4 ${
                      isDuplicate ? "border-danger bg-danger-soft" : "border-border bg-surface-soft"
                    }`}
                  >
                  <Select value={row.academicYearId} onChange={(e) => updateRow(i, { academicYearId: e.target.value })}>
                    {years.map((y) => (
                      <option key={y.id} value={y.id}>
                        {y.name}
                      </option>
                    ))}
                  </Select>
                  <Select
                    value={row.classId}
                    onChange={(e) => {
                      const c = classes.find((cl) => cl.id === e.target.value);
                      updateRow(i, { classId: e.target.value, sectionId: c?.sections[0]?.id ?? "" });
                    }}
                  >
                    {classes.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </Select>
                  <Select value={row.sectionId} onChange={(e) => updateRow(i, { sectionId: e.target.value })}>
                    {cls?.sections.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </Select>
                  <div className="flex gap-1">
                    <Select value={row.subjectId} onChange={(e) => updateRow(i, { subjectId: e.target.value })} className="flex-1">
                      {subjects.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </Select>
                    <button
                      type="button"
                      onClick={() => removeRow(i)}
                      className="shrink-0 rounded-lg p-2 text-foreground-muted hover:bg-danger-soft hover:text-danger"
                      aria-label="Remove assignment"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                  </div>
                  {isDuplicate && (
                    <p className="mt-1 flex items-center gap-1 text-xs text-danger">
                      <AlertTriangle className="size-3.5" /> This subject is already assigned to this class/section for this year.
                    </p>
                  )}
                </div>
              );
            })}
          </div>
          <Button type="button" variant="outline" size="sm" icon={<Plus className="size-4" />} onClick={addRow}>
            Add assignment
          </Button>
        </>
      )}
    </div>
  );
}
