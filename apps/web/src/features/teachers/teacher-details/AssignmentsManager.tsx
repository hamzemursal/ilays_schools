"use client";

import { useEffect, useState } from "react";
import { BookUser, Check, Pencil, Plus, Trash2 } from "lucide-react";
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
  const [subjectId, setSubjectId] = useState("");
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
    setSubjectId("");
    setEditing(true);
  }

  function onYearChange(newYearId: string) {
    setAcademicYearId(newYearId);
    setClassId("");
    setSectionId("");
    setSubjectId("");
  }

  function onClassChange(newClassId: string) {
    setClassId(newClassId);
    setSectionId("");
    setSubjectId("");
  }

  async function onAdd() {
    if (!academicYearId || !classId || !sectionId || !subjectId) return;
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
                <Select
                  value={sectionId}
                  onChange={(e) => setSectionId(e.target.value)}
                  disabled={!classId}
                  className="w-auto"
                >
                  <option value="">Select section</option>
                  {(selectedClass?.sections ?? []).map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </Select>
              </FormField>
              <FormField label="Subject" required className="w-auto">
                <ClassSubjectSelect
                  key={classId}
                  accessToken={accessToken}
                  schoolId={schoolId}
                  classId={classId}
                  value={subjectId}
                  onChange={setSubjectId}
                />
              </FormField>
              <Button
                size="sm"
                icon={<Plus className="size-4" />}
                loading={adding}
                disabled={!academicYearId || !classId || !sectionId || !subjectId}
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

function ClassSubjectSelect({
  accessToken,
  schoolId,
  classId,
  value,
  onChange,
}: {
  accessToken: string;
  schoolId: string;
  classId: string;
  value: string;
  onChange: (subjectId: string) => void;
}) {
  const [subjects, setSubjects] = useState<ClassSubjectRecord[] | null>(null);

  useEffect(() => {
    if (!classId) return;
    api
      .listClassSubjects(accessToken, schoolId, classId)
      .then(setSubjects)
      .catch(() => setSubjects([]));
  }, [accessToken, schoolId, classId]);

  return (
    <Select value={value} onChange={(e) => onChange(e.target.value)} disabled={!classId || !subjects} className="w-auto">
      <option value="">{classId && subjects === null ? "Loading…" : "Select subject"}</option>
      {(subjects ?? []).map((cs) => (
        <option key={cs.subjectId} value={cs.subjectId}>
          {cs.subject.name}
        </option>
      ))}
    </Select>
  );
}
