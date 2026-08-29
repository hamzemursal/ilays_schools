"use client";

import { useEffect, useState } from "react";
import { BookUser, Plus, X } from "lucide-react";
import { api, type AcademicYear, type ClassWithSections, type Subject, type Teacher } from "@/lib/api";
import { ApiError } from "@/lib/auth-context";
import { teachersApi } from "../api";
import { Card, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { EmptyState } from "@/components/ui/EmptyState";
import { Select } from "@/components/ui/FormControls";
import { useToast } from "@/components/ui/Toast";

// Lets a School Admin hold a teacher assigned to any number of
// class/section/subject/year combinations — not just the ones picked
// during initial creation. Reuses the same addAssignment endpoint the
// creation wizard already calls, so there's no duplicate business logic.
export function AssignmentsManager({
  accessToken,
  schoolId,
  teacher,
  canManage,
  onChange,
}: {
  accessToken: string;
  schoolId: string;
  teacher: Teacher;
  canManage: boolean;
  onChange: (teacher: Teacher) => void;
}) {
  const { show } = useToast();
  const [years, setYears] = useState<AcademicYear[]>([]);
  const [classes, setClasses] = useState<ClassWithSections[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [academicYearId, setAcademicYearId] = useState("");
  const [classId, setClassId] = useState("");
  const [sectionId, setSectionId] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [adding, setAdding] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!canManage) return;
    Promise.all([
      api.listAcademicYears(accessToken, schoolId),
      api.listClasses(accessToken, schoolId),
      api.listSubjects(accessToken, schoolId),
    ]).then(([y, c, s]) => {
      setYears(y);
      setClasses(c);
      setSubjects(s);
      const current = y.find((yr) => yr.isCurrent) ?? y[0];
      if (current) setAcademicYearId(current.id);
      if (c[0]) setClassId(c[0].id);
      if (c[0]?.sections[0]) setSectionId(c[0].sections[0].id);
      if (s[0]) setSubjectId(s[0].id);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canManage]);

  const selectedClass = classes.find((c) => c.id === classId);

  function onClassChange(newClassId: string) {
    setClassId(newClassId);
    const cls = classes.find((c) => c.id === newClassId);
    setSectionId(cls?.sections[0]?.id ?? "");
  }

  async function onAdd() {
    if (!academicYearId || !sectionId || !subjectId) return;
    setAdding(true);
    setError(null);
    try {
      await teachersApi.addAssignment(accessToken, schoolId, teacher.id, { academicYearId, sectionId, subjectId });
      const updated = await teachersApi.getOne(accessToken, schoolId, teacher.id);
      onChange(updated);
      show("Assignment added.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to add assignment");
    } finally {
      setAdding(false);
    }
  }

  async function onRemove(assignmentId: string) {
    setRemovingId(assignmentId);
    setError(null);
    try {
      await teachersApi.removeAssignment(accessToken, schoolId, teacher.id, assignmentId);
      const updated = await teachersApi.getOne(accessToken, schoolId, teacher.id);
      onChange(updated);
      show("Assignment removed.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to remove assignment");
    } finally {
      setRemovingId(null);
    }
  }

  const assignmentsByYear = teacher.assignments.reduce<Record<string, typeof teacher.assignments>>((acc, a) => {
    (acc[a.academicYear.name] ??= []).push(a);
    return acc;
  }, {});

  return (
    <Card padding="none">
      <CardHeader title="Classes & subjects" description="Every assignment this teacher currently holds, by academic year." />
      <div className="space-y-4 p-5">
        {teacher.assignments.length === 0 ? (
          <EmptyState
            icon={BookUser}
            title="No assignments yet"
            description={canManage ? "Assign this teacher to a class and subject below." : "This teacher has no assignments yet."}
          />
        ) : (
          Object.entries(assignmentsByYear).map(([yearName, assignments]) => (
            <div key={yearName}>
              <p className="text-xs font-semibold uppercase tracking-wide text-foreground-muted">{yearName}</p>
              <div className="mt-1.5 flex flex-wrap gap-2">
                {assignments.map((a) => (
                  <Badge key={a.id} tone="accent">
                    {a.section.class.name} · {a.section.name} — {a.subject.name}
                    {canManage && (
                      <button
                        type="button"
                        onClick={() => onRemove(a.id)}
                        disabled={removingId === a.id}
                        aria-label={`Remove ${a.section.class.name} · ${a.section.name} — ${a.subject.name}`}
                        className="ml-1 rounded-full hover:bg-accent/30 disabled:opacity-50"
                      >
                        <X className="size-3" />
                      </button>
                    )}
                  </Badge>
                ))}
              </div>
            </div>
          ))
        )}

        {canManage && (
          <div className="border-t border-border pt-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-foreground-muted">Add assignment</p>
            <div className="flex flex-wrap items-end gap-2">
              <Select value={academicYearId} onChange={(e) => setAcademicYearId(e.target.value)} className="w-auto">
                {years.map((y) => (
                  <option key={y.id} value={y.id}>
                    {y.name}
                  </option>
                ))}
              </Select>
              <Select value={classId} onChange={(e) => onClassChange(e.target.value)} className="w-auto">
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
              <Select value={sectionId} onChange={(e) => setSectionId(e.target.value)} className="w-auto">
                {(selectedClass?.sections ?? []).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
              <Select value={subjectId} onChange={(e) => setSubjectId(e.target.value)} className="w-auto">
                {subjects.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
              <Button
                size="sm"
                icon={<Plus className="size-4" />}
                loading={adding}
                disabled={!academicYearId || !sectionId || !subjectId}
                onClick={onAdd}
              >
                Add
              </Button>
            </div>
            {error && (
              <Alert tone="danger" className="mt-2">
                {error}
              </Alert>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}
