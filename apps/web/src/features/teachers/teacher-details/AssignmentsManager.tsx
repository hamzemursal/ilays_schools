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
  // Every teacher's assignments in this school — not just this one's — so
  // the subject picker below can exclude a subject the moment ANY teacher
  // already holds it for that class/section/year, not just this teacher.
  // Result submission assumes a single teacher owns each (subject, section);
  // see ExamSubject's schema comment.
  const [allTeachers, setAllTeachers] = useState<Teacher[]>([]);
  const [academicYearId, setAcademicYearId] = useState("");
  const [classId, setClassId] = useState("");
  const [sectionId, setSectionId] = useState("");
  const [subjectIds, setSubjectIds] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<TeacherAssignment | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function refreshAllTeachers() {
    return teachersApi.list(accessToken, schoolId).then(setAllTeachers);
  }

  useEffect(() => {
    if (!canManage || !editing) return;
    Promise.all([api.listAcademicYears(accessToken, schoolId), api.listClasses(accessToken, schoolId), refreshAllTeachers()]).then(
      ([y, c]) => {
        setYears(y);
        setClasses(c);
      },
    );
    // refreshAllTeachers is stable for the lifetime of this component
    // instance (closes over accessToken/schoolId props, not state) — safe
    // to omit from deps the same way the fetch calls above are.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  // Subjects ANY teacher already holds for the section currently picked
  // above — this teacher included. A subject/section is meant to have one
  // owning teacher (see the comment on `allTeachers` above), so once
  // someone holds it, it simply shouldn't be offered again here.
  const takenSubjectIds = new Set(
    allTeachers
      .flatMap((t) => t.assignments)
      .filter((a) => a.academicYearId === academicYearId && a.section.id === sectionId)
      .map((a) => a.subject.id),
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
      const [updated] = await Promise.all([teachersApi.getOne(accessToken, schoolId, teacher.id), refreshAllTeachers()]);
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
      const [updated] = await Promise.all([teachersApi.getOne(accessToken, schoolId, teacher.id), refreshAllTeachers()]);
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
                  taken={takenSubjectIds}
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
  taken,
  onToggle,
}: {
  accessToken: string;
  schoolId: string;
  classId: string;
  selected: Set<string>;
  taken: Set<string>;
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

  // Only ever offer subjects nobody holds yet for this class/section/year —
  // a taken one already appears in the list above (this teacher) or belongs
  // to a colleague, so re-offering it here would just invite a conflicting
  // assignment.
  const assignable = subjects.filter((cs) => !taken.has(cs.subjectId));

  if (assignable.length === 0) {
    return (
      <p className="rounded-lg border border-border px-3 py-4 text-sm text-foreground-muted">
        Every subject in this class is already assigned to a teacher for this section.
      </p>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-1 rounded-lg border border-border p-2 sm:grid-cols-3 lg:grid-cols-4">
      {assignable.map((cs) => (
        <label
          key={cs.subjectId}
          className={`flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm ${
            selected.has(cs.subjectId) ? "bg-accent-soft text-accent" : "hover:bg-surface-hover"
          }`}
        >
          <input
            type="checkbox"
            checked={selected.has(cs.subjectId)}
            onChange={(e) => onToggle(cs.subjectId, e.target.checked)}
            className={CHECKBOX_CLASS}
          />
          <span className="truncate font-medium">{cs.subject.name}</span>
        </label>
      ))}
    </div>
  );
}
