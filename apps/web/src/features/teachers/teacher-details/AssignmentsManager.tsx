"use client";

import { useEffect, useState } from "react";
import { BookUser, Check, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { api, type AcademicYear, type ClassSubjectRecord, type ClassWithSections, type Teacher } from "@/lib/api";
import { ApiError } from "@/lib/auth-context";
import { teachersApi } from "../api";
import { Card, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { FormField, Select } from "@/components/ui/FormControls";
import { useToast } from "@/components/ui/Toast";

const CHECKBOX_CLASS =
  "size-4 shrink-0 rounded border-border text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40";

type TeacherAssignment = Teacher["assignments"][number];

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
  const [editing, setEditing] = useState(false);
  const [years, setYears] = useState<AcademicYear[]>([]);
  const [classes, setClasses] = useState<ClassWithSections[]>([]);
  const [academicYearId, setAcademicYearId] = useState("");
  const [classId, setClassId] = useState("");
  const [sectionId, setSectionId] = useState("");
  const [subjectIds, setSubjectIds] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<TeacherAssignment | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!canManage || !editing) return;
    Promise.all([api.listAcademicYears(accessToken, schoolId), api.listClasses(accessToken, schoolId)]).then(
      ([y, c]) => {
        setYears(y);
        setClasses(c);
      },
    );
  }, [accessToken, schoolId, canManage, editing]);

  const selectedClass = classes.find((c) => c.id === classId);

  function startEditing() {
    setAcademicYearId("");
    setClassId("");
    setSectionId("");
    setSubjectIds(new Set());
    setEditing(true);
  }

  function onYearChange(newYearId: string) {
    setAcademicYearId(newYearId);
    setClassId("");
    setSectionId("");
    setSubjectIds(new Set());
  }

  function onClassChange(newClassId: string) {
    setClassId(newClassId);
    setSectionId("");
    setSubjectIds(new Set());
  }

  function onSectionChange(newSectionId: string) {
    setSectionId(newSectionId);
    setSubjectIds(new Set());
  }

  function toggleSubject(subjectId: string, checked: boolean) {
    const next = new Set(subjectIds);
    if (checked) next.add(subjectId);
    else next.delete(subjectId);
    setSubjectIds(next);
  }

  // Subjects this teacher already holds for the section currently picked
  // above — checked against here (not just left for the backend's unique
  // constraint to reject) so the list simply doesn't offer them again.
  const alreadyAssignedSubjectIds = new Set(
    teacher.assignments.filter((a) => a.academicYearId === academicYearId && a.section.id === sectionId).map((a) => a.subject.id),
  );

  async function onAdd() {
    if (!academicYearId || !classId || !sectionId || subjectIds.size === 0) return;
    setAdding(true);
    setError(null);
    try {
      const results = await Promise.allSettled(
        Array.from(subjectIds).map((subjectId) =>
          teachersApi.addAssignment(accessToken, schoolId, teacher.id, { academicYearId, sectionId, subjectId }),
        ),
      );
      const updated = await teachersApi.getOne(accessToken, schoolId, teacher.id);
      onChange(updated);

      const failed = results.filter((r) => r.status === "rejected").length;
      const added = results.length - failed;
      if (failed > 0) {
        const firstError = results.find((r): r is PromiseRejectedResult => r.status === "rejected")?.reason;
        setError(
          `Added ${added} of ${results.length} subject(s). ${firstError instanceof ApiError ? firstError.message : "Some assignments failed."}`,
        );
      } else {
        show(`${added} subject assignment${added === 1 ? "" : "s"} added.`);
      }
      setSubjectIds(new Set());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to add assignments");
    } finally {
      setAdding(false);
    }
  }

  async function onDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await teachersApi.removeAssignment(accessToken, schoolId, teacher.id, deleteTarget.id);
      const updated = await teachersApi.getOne(accessToken, schoolId, teacher.id);
      onChange(updated);
      show("Assignment deleted permanently.");
      setDeleteTarget(null);
    } catch (err) {
      show(err instanceof ApiError ? err.message : "Failed to delete assignment", "danger");
    } finally {
      setDeleting(false);
    }
  }

  const assignmentsByYear = teacher.assignments.reduce<Record<string, typeof teacher.assignments>>((acc, a) => {
    (acc[a.academicYear.name] ??= []).push(a);
    return acc;
  }, {});

  return (
    <Card padding="none">
      <CardHeader
        title="Classes & subjects"
        description="Every assignment this teacher currently holds, by academic year."
        actions={
          canManage &&
          (editing ? (
            <Button size="sm" variant="outline" icon={<Check className="size-4" />} onClick={() => setEditing(false)}>
              Done
            </Button>
          ) : (
            <Button size="sm" variant="outline" icon={<Pencil className="size-4" />} onClick={startEditing}>
              Edit
            </Button>
          ))
        }
      />
      <div className="space-y-4 p-5">
        {teacher.assignments.length === 0 ? (
          <EmptyState
            icon={BookUser}
            title="No assignments yet"
            description={
              canManage
                ? editing
                  ? "Assign this teacher to a class and subject below."
                  : "Click Edit to assign this teacher to a class and subject."
                : "This teacher has no assignments yet."
            }
          />
        ) : (
          Object.entries(assignmentsByYear).map(([yearName, assignments]) => (
            <div key={yearName}>
              <p className="text-xs font-semibold uppercase tracking-wide text-foreground-muted">{yearName}</p>
              <div className="mt-1.5 space-y-2">
                {assignments.map((a) => (
                  <div
                    key={a.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-3 py-2"
                  >
                    <p className="text-sm text-foreground">
                      {a.section.class.name} · {a.section.name} — {a.subject.name}
                    </p>
                    {canManage && editing && (
                      <Button
                        size="sm"
                        variant="danger"
                        icon={<Trash2 className="size-4" />}
                        onClick={() => setDeleteTarget(a)}
                      >
                        Delete
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))
        )}

        {canManage && editing && (
          <div className="border-t border-border pt-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-foreground-muted">Add assignment</p>
            <div className="flex flex-wrap items-end gap-2">
              <FormField label="Academic year" required className="w-auto">
                <Select value={academicYearId} onChange={(e) => onYearChange(e.target.value)} className="w-auto">
                  <option value="">Select academic year</option>
                  {years.map((y) => (
                    <option key={y.id} value={y.id}>
                      {y.name}
                    </option>
                  ))}
                </Select>
              </FormField>
              <FormField label="Class" required className="w-auto">
                <Select
                  value={classId}
                  onChange={(e) => onClassChange(e.target.value)}
                  disabled={!academicYearId}
                  className="w-auto"
                >
                  <option value="">Select class</option>
                  {classes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </FormField>
              <FormField label="Section" required className="w-auto">
                <Select value={sectionId} onChange={(e) => onSectionChange(e.target.value)} disabled={!classId} className="w-auto">
                  <option value="">Select section</option>
                  {(selectedClass?.sections ?? []).map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </Select>
              </FormField>
            </div>

            {classId && (
              <div className="mt-3">
                <ClassSubjectChecklist
                  key={classId}
                  accessToken={accessToken}
                  schoolId={schoolId}
                  classId={classId}
                  selected={subjectIds}
                  alreadyAssigned={alreadyAssignedSubjectIds}
                  onToggle={toggleSubject}
                />
              </div>
            )}

            <div className="mt-3 flex items-center gap-2">
              <Button
                size="sm"
                icon={<Plus className="size-4" />}
                loading={adding}
                disabled={!academicYearId || !classId || !sectionId || subjectIds.size === 0}
                onClick={onAdd}
              >
                {subjectIds.size > 0 ? `Add ${subjectIds.size} subject${subjectIds.size === 1 ? "" : "s"}` : "Add"}
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

      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete this assignment permanently?"
        description={
          deleteTarget
            ? `This permanently removes ${teacher.firstName} ${teacher.lastName}'s assignment to ${deleteTarget.section.class.name} · ${deleteTarget.section.name} — ${deleteTarget.subject.name} from the database. This action cannot be undone. The teacher, subject, class, and section themselves are not affected.`
            : undefined
        }
        confirmLabel="Delete permanently"
        loading={deleting}
        onConfirm={onDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </Card>
  );
}

function ClassSubjectChecklist({
  accessToken,
  schoolId,
  classId,
  selected,
  alreadyAssigned,
  onToggle,
}: {
  accessToken: string;
  schoolId: string;
  classId: string;
  selected: Set<string>;
  alreadyAssigned: Set<string>;
  onToggle: (subjectId: string, checked: boolean) => void;
}) {
  const [subjects, setSubjects] = useState<ClassSubjectRecord[] | null>(null);

  useEffect(() => {
    if (!classId) return;
    api
      .listClassSubjects(accessToken, schoolId, classId)
      .then(setSubjects)
      .catch(() => setSubjects([]));
  }, [accessToken, schoolId, classId]);

  if (subjects === null) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-border px-3 py-4 text-sm text-foreground-muted">
        <Loader2 className="size-4 animate-spin" /> Loading subjects…
      </div>
    );
  }

  if (subjects.length === 0) {
    return (
      <p className="rounded-lg border border-border px-3 py-4 text-sm text-foreground-muted">
        This class has no subjects assigned yet — add subjects to it first, in Academic → Classes &amp; sections.
      </p>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-1 rounded-lg border border-border p-2 sm:grid-cols-3 lg:grid-cols-4">
      {subjects.map((cs) => {
        const taken = alreadyAssigned.has(cs.subjectId);
        return (
          <label
            key={cs.subjectId}
            className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${
              taken
                ? "cursor-not-allowed text-foreground-muted opacity-60"
                : selected.has(cs.subjectId)
                  ? "cursor-pointer bg-accent-soft text-accent"
                  : "cursor-pointer hover:bg-surface-hover"
            }`}
            title={taken ? "Already assigned to this class & section" : undefined}
          >
            <input
              type="checkbox"
              checked={selected.has(cs.subjectId) || taken}
              disabled={taken}
              onChange={(e) => onToggle(cs.subjectId, e.target.checked)}
              className={CHECKBOX_CLASS}
            />
            <span className="truncate font-medium">{cs.subject.name}</span>
          </label>
        );
      })}
    </div>
  );
}
