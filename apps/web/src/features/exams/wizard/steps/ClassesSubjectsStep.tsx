"use client";

import { useEffect, useState } from "react";
import { BookOpen, Loader2 } from "lucide-react";
import { api, ApiError, type ClassWithSections, type Subject } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Alert } from "@/components/ui/Alert";
import { EmptyState } from "@/components/ui/EmptyState";
import type { ExamWizardState } from "../types";

const CHECKBOX_CLASS =
  "size-4 shrink-0 rounded border-border text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40";

export function isClassesSubjectsValid(state: ExamWizardState): boolean {
  return state.selectedClassIds.size > 0 && state.selectedSubjectIds.size > 0;
}

export function ClassesSubjectsStep({
  state,
  classes,
  accessToken,
  schoolId,
  onChange,
}: {
  state: ExamWizardState;
  classes: ClassWithSections[];
  accessToken: string;
  schoolId: string;
  onChange: (patch: Partial<ExamWizardState>) => void;
}) {
  const [availableSubjects, setAvailableSubjects] = useState<Subject[] | null>(null);
  const [loadingSubjects, setLoadingSubjects] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Stable dependency for the effect below — Set identity changes every
  // render even when its contents don't, so this is what actually gates
  // the re-fetch.
  const selectedClassKey = Array.from(state.selectedClassIds).sort().join(",");

  // The "start loading" flip and the "nothing selected" reset both happen
  // here, during render, the same way ExamPapersExplorer's prevSchoolId
  // does it — so the effect below only ever calls setState from inside its
  // async callbacks, never synchronously in its own body.
  const [prevClassKey, setPrevClassKey] = useState(selectedClassKey);
  if (selectedClassKey !== prevClassKey) {
    setPrevClassKey(selectedClassKey);
    setLoadError(null);
    if (selectedClassKey) setLoadingSubjects(true);
    else {
      setAvailableSubjects(null);
      setLoadingSubjects(false);
    }
  }

  useEffect(() => {
    if (!selectedClassKey) return;
    const classIds = selectedClassKey.split(",");

    let cancelled = false;

    Promise.all(classIds.map((classId) => api.listClassSubjects(accessToken, schoolId, classId)))
      .then((results) => {
        if (cancelled) return;
        // Flatten and de-duplicate by subject id — the same subject shared
        // by two selected classes (e.g. Mathematics in both Class 5 and
        // Class 8) must appear exactly once.
        const bySubjectId = new Map<string, Subject>();
        for (const rows of results) {
          for (const row of rows) bySubjectId.set(row.subjectId, row.subject);
        }
        const merged = Array.from(bySubjectId.values()).sort((a, b) => a.name.localeCompare(b.name));
        setAvailableSubjects(merged);

        // Drop any previously-selected subject that no longer belongs to
        // any currently-selected class — never leave a stale selection.
        const validIds = new Set(merged.map((s) => s.id));
        const stillValid = new Set(Array.from(state.selectedSubjectIds).filter((id) => validIds.has(id)));
        if (stillValid.size !== state.selectedSubjectIds.size) {
          onChange({ selectedSubjectIds: stillValid });
        }
      })
      .catch((err) => {
        if (!cancelled) setLoadError(err instanceof ApiError ? err.message : "Failed to load subjects for the selected classes");
      })
      .finally(() => {
        if (!cancelled) setLoadingSubjects(false);
      });

    return () => {
      cancelled = true;
    };
    // selectedSubjectIds is intentionally excluded — this effect only reacts
    // to the class selection changing, and reads the current subject
    // selection via the closure to prune it, not to re-trigger itself.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedClassKey, accessToken, schoolId]);

  function toggleClass(classId: string, checked: boolean) {
    const next = new Set(state.selectedClassIds);
    if (checked) next.add(classId);
    else next.delete(classId);
    onChange({ selectedClassIds: next });
  }

  function selectAllClasses() {
    onChange({ selectedClassIds: new Set(classes.map((c) => c.id)) });
  }

  function clearAllClasses() {
    onChange({ selectedClassIds: new Set(), selectedSubjectIds: new Set() });
  }

  function toggleSubject(subjectId: string, checked: boolean) {
    const next = new Set(state.selectedSubjectIds);
    if (checked) next.add(subjectId);
    else next.delete(subjectId);
    onChange({ selectedSubjectIds: next });
  }

  function selectAllSubjects() {
    if (!availableSubjects) return;
    onChange({ selectedSubjectIds: new Set(availableSubjects.map((s) => s.id)) });
  }

  function clearAllSubjects() {
    onChange({ selectedSubjectIds: new Set() });
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-sm font-semibold text-foreground">Classes &amp; subjects</h2>
        <p className="mt-0.5 text-sm text-foreground-soft">
          Select every class this exam applies to, then choose which of their subjects to include.
        </p>
      </div>

      <div className="rounded-xl border border-border">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-medium text-foreground">Classes</h3>
            <Badge tone="accent">{state.selectedClassIds.size} selected</Badge>
          </div>
          <div className="flex gap-2">
            <Button type="button" size="sm" variant="outline" onClick={selectAllClasses} disabled={classes.length === 0}>
              Select All
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={clearAllClasses} disabled={state.selectedClassIds.size === 0}>
              Clear All
            </Button>
          </div>
        </div>

        {classes.length === 0 ? (
          <p className="p-4 text-sm text-foreground-muted">No classes exist yet for this school.</p>
        ) : (
          <div className="grid grid-cols-1 gap-1 p-3 sm:grid-cols-2 lg:grid-cols-3">
            {classes.map((cls) => (
              <label
                key={cls.id}
                className={`flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm ${
                  state.selectedClassIds.has(cls.id) ? "bg-accent-soft text-accent" : "hover:bg-surface-hover"
                }`}
              >
                <input
                  type="checkbox"
                  checked={state.selectedClassIds.has(cls.id)}
                  onChange={(e) => toggleClass(cls.id, e.target.checked)}
                  className={CHECKBOX_CLASS}
                />
                <span className="truncate font-medium">{cls.name}</span>
                <span className="ml-auto shrink-0 text-xs text-foreground-muted">{cls.division.type}</span>
              </label>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-xl border border-border">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-medium text-foreground">Subjects</h3>
            {availableSubjects && <Badge tone="accent">{state.selectedSubjectIds.size} selected</Badge>}
            {availableSubjects && <Badge tone="neutral">{availableSubjects.length} available</Badge>}
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={selectAllSubjects}
              disabled={!availableSubjects || availableSubjects.length === 0}
            >
              Select All
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={clearAllSubjects}
              disabled={state.selectedSubjectIds.size === 0}
            >
              Clear All
            </Button>
          </div>
        </div>

        <div className="p-3">
          {loadError && <Alert tone="danger">{loadError}</Alert>}

          {state.selectedClassIds.size === 0 ? (
            <EmptyState
              icon={BookOpen}
              title="No classes selected"
              description="Select one or more classes above to load available subjects."
            />
          ) : loadingSubjects ? (
            <div className="flex items-center justify-center gap-2 py-8 text-sm text-foreground-muted">
              <Loader2 className="size-4 animate-spin" /> Loading subjects for the selected classes…
            </div>
          ) : availableSubjects && availableSubjects.length === 0 ? (
            <EmptyState
              icon={BookOpen}
              title="No subjects assigned"
              description="The selected class(es) have no subjects assigned yet — add subjects to the class first, in Academic → Classes & sections."
            />
          ) : (
            <div className="grid grid-cols-1 gap-1 sm:grid-cols-2 lg:grid-cols-3">
              {availableSubjects?.map((subject) => (
                <label
                  key={subject.id}
                  className={`flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm ${
                    state.selectedSubjectIds.has(subject.id) ? "bg-accent-soft text-accent" : "hover:bg-surface-hover"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={state.selectedSubjectIds.has(subject.id)}
                    onChange={(e) => toggleSubject(subject.id, e.target.checked)}
                    className={CHECKBOX_CLASS}
                  />
                  <span className="truncate font-medium">{subject.name}</span>
                  {subject.code && <span className="ml-auto shrink-0 font-mono text-xs text-foreground-muted">{subject.code}</span>}
                </label>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
