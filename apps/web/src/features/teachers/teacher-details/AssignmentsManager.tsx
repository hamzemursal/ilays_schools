"use client";

import { useEffect, useState } from "react";
import { BookUser, Check, ChevronDown, ChevronUp, GraduationCap, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { api, type AcademicYear, type ClassSubjectRecord, type ClassWithSections, type Teacher } from "@/lib/api";
import { ApiError } from "@/lib/auth-context";
import { teachersApi } from "../api";
import { groupAssignmentsByClass, groupAssignmentsBySchool, groupAssignmentsByYear } from "@/features/my-classes/schoolGrouping";
import { SchoolTypeBadge } from "@/features/my-classes/components/SchoolTypeBadge";
import { Card, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { FormField, Select } from "@/components/ui/FormControls";
import { useToast } from "@/components/ui/Toast";
import type { DecorativeTone } from "@/components/ui/decorativeTones";

const CHECKBOX_CLASS =
  "size-4 shrink-0 rounded border-border text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40";

// Purely presentational — a stable, deterministic subject/section accent,
// never stored anywhere. Cycles through the app's existing decorative
// palette (see decorativeTones.ts) so a class with several subjects reads
// as several distinct rows without inventing new colors outside the design
// system, or repurposing the semantic accent/success tones.
const SUBJECT_TONES: DecorativeTone[] = ["violet", "teal", "amber", "rose"];
const SUBJECT_DOT_CLASSES: Record<DecorativeTone, string> = {
  violet: "bg-violet-500",
  teal: "bg-teal-500",
  amber: "bg-amber-500",
  rose: "bg-rose-500",
};
function subjectTone(subjectId: string): DecorativeTone {
  let hash = 0;
  for (let i = 0; i < subjectId.length; i++) hash = (hash * 31 + subjectId.charCodeAt(i)) >>> 0;
  return SUBJECT_TONES[hash % SUBJECT_TONES.length];
}

type TeacherAssignment = Teacher["assignments"][number];

// Lets a School Admin (or Super Admin — see canSeeAllSchools) hold a
// teacher assigned to any number of class/section/subject/year
// combinations — not just the ones picked during initial creation. Reuses
// the same addAssignment endpoint the creation wizard already calls, so
// there's no duplicate business logic.
export function AssignmentsManager({
  accessToken,
  schoolId,
  teacher,
  canManage,
  // Only a Super Admin / Organization Admin gets the cross-school "Assigned
  // Schools" switcher and other schools' real names — everyone else keeps
  // exactly the existing "Also teaches at N other school(s)" count-only
  // behavior. Org-wide reach is decided the same way the backend itself
  // decides it (see AuthenticatedUser.schoolIds / accessibleWhere): an
  // empty schoolIds list means "not limited to specific schools."
  canSeeAllSchools = false,
  onChange,
}: {
  accessToken: string;
  schoolId: string;
  teacher: Teacher;
  canManage: boolean;
  canSeeAllSchools?: boolean;
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

  // Which school's assignments are currently on screen (Super Admin only —
  // everyone else is always pinned to `schoolId`), and which of that
  // school's academic years. Both are "sticky until proven stale": once the
  // viewer picks one, it's kept even if the derived default would now point
  // elsewhere, but an invalid leftover choice (e.g. a year that doesn't
  // exist for the newly picked school) is never rendered as if it were real.
  const [viewSchoolIdChoice, setViewSchoolIdChoice] = useState<string | null>(null);
  const [viewYearIdChoice, setViewYearIdChoice] = useState<string | null>(null);
  const [collapsedClassIds, setCollapsedClassIds] = useState<Set<string>>(new Set());

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

  // Every real school this teacher has at least one assignment at — a
  // Super Admin sees all of them as switchable cards; everyone else never
  // computes this (canSeeAllSchools stays false, so this is just []).
  const schools = canSeeAllSchools ? groupAssignmentsBySchool(teacher.assignments) : [];
  const otherSchoolCount = new Set(teacher.assignments.filter((a) => a.schoolId !== schoolId).map((a) => a.schoolId)).size;

  // The school currently on screen: the viewer's own explicit pick if it's
  // still one of this teacher's real schools, else this page's own school
  // if it has any assignments, else whichever school comes first — always
  // something concrete, never "no school selected."
  const viewSchoolId =
    canSeeAllSchools && viewSchoolIdChoice && schools.some((s) => s.id === viewSchoolIdChoice)
      ? viewSchoolIdChoice
      : (schools.find((s) => s.id === schoolId)?.id ?? schools[0]?.id ?? schoolId);

  // Non-Super-Admin viewers are always pinned to this page's own school —
  // school isolation for them isn't a UI nicety, it's the only assignment
  // data they're ever handed to render.
  const schoolAssignments = canSeeAllSchools
    ? (schools.find((s) => s.id === viewSchoolId)?.assignments ?? [])
    : teacher.assignments.filter((a) => a.schoolId === schoolId);

  const viewYears = groupAssignmentsByYear(schoolAssignments);
  const viewYearId =
    viewYearIdChoice && viewYears.some((y) => y.academicYearId === viewYearIdChoice)
      ? viewYearIdChoice
      : (viewYears.find((y) => y.assignments[0]?.academicYear.isCurrent)?.academicYearId ?? viewYears[0]?.academicYearId ?? null);

  const yearAssignments = viewYears.find((y) => y.academicYearId === viewYearId)?.assignments ?? [];
  const classGroups = groupAssignmentsByClass(yearAssignments);

  // Editing only ever targets this page's own school (the add/remove
  // assignment endpoints are scoped to `schoolId`) — switching the view to
  // a different school hides the editor rather than silently writing to a
  // school the admin isn't currently looking at.
  const canEditHere = canManage && viewSchoolId === schoolId;

  function toggleClassCollapsed(classId: string) {
    const next = new Set(collapsedClassIds);
    if (next.has(classId)) next.delete(classId);
    else next.add(classId);
    setCollapsedClassIds(next);
  }

  return (
    <Card padding="none">
      <CardHeader
        title="Classes, sections & subjects"
        description="View all classes, sections, and subjects assigned to this teacher, organized by school and academic year."
        actions={
          canEditHere &&
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
      <div className="space-y-5 p-5">
        {canSeeAllSchools && schools.length > 0 && (
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-foreground-muted">Assigned schools</p>
            <div className="grid gap-3 sm:grid-cols-2">
              {schools.map((school) => (
                <button
                  key={school.id}
                  type="button"
                  onClick={() => {
                    setViewSchoolIdChoice(school.id);
                    setViewYearIdChoice(null);
                  }}
                  className={`rounded-xl border p-3 text-left transition-colors ${
                    school.id === viewSchoolId
                      ? "border-accent bg-accent-soft/30 ring-1 ring-accent/30"
                      : "border-border bg-background hover:border-accent hover:bg-accent-soft/20"
                  }`}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-sm font-semibold text-foreground">{school.name}</span>
                    <SchoolTypeBadge type={school.type} />
                    {school.id === viewSchoolId && (
                      <Badge tone="accent" className="ml-auto">
                        <Check className="size-3" /> Selected
                      </Badge>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-foreground-soft">
                    {school.classCount} {school.classCount === 1 ? "class" : "classes"} · {school.sectionCount}{" "}
                    {school.sectionCount === 1 ? "section" : "sections"} · {school.subjectCount}{" "}
                    {school.subjectCount === 1 ? "subject" : "subjects"}
                  </p>
                </button>
              ))}
            </div>
          </div>
        )}

        {!canSeeAllSchools && otherSchoolCount > 0 && (
          <p className="text-sm text-foreground-soft">
            Also teaches at {otherSchoolCount} other school{otherSchoolCount === 1 ? "" : "s"}.
          </p>
        )}

        {viewYears.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            {viewYears.map((y) => {
              const isCurrent = y.assignments[0]?.academicYear.isCurrent ?? false;
              const isSelected = y.academicYearId === viewYearId;
              return (
                <button
                  key={y.academicYearId}
                  type="button"
                  onClick={() => setViewYearIdChoice(y.academicYearId)}
                  className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${
                    isSelected
                      ? "border-accent bg-accent-soft text-accent"
                      : "border-border text-foreground-soft hover:border-accent hover:text-accent"
                  }`}
                >
                  {y.academicYearName}
                  {isCurrent && (
                    <span className="rounded-full bg-success-soft px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-success">
                      Current
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {classGroups.length === 0 ? (
          <EmptyState
            icon={BookUser}
            title="No assignments at this school yet"
            description={
              canEditHere
                ? editing
                  ? "Assign this teacher to a class and subject below."
                  : "Click Edit to assign this teacher to a class and subject."
                : "This teacher has no assignments at this school yet."
            }
          />
        ) : (
          <div className="space-y-3">
            {classGroups.map((cg) => {
              const collapsed = collapsedClassIds.has(cg.classId);
              return (
                <div key={cg.classId} className="overflow-hidden rounded-xl border border-border">
                  <button
                    type="button"
                    onClick={() => toggleClassCollapsed(cg.classId)}
                    className="flex w-full items-center justify-between gap-3 bg-surface px-4 py-3 text-left transition-colors hover:bg-surface-hover"
                  >
                    <span className="flex items-center gap-2">
                      <GraduationCap className="size-4 text-accent" />
                      <span className="text-sm font-semibold text-foreground">{cg.className}</span>
                      <span className="text-xs text-foreground-muted">
                        {cg.sections.length} {cg.sections.length === 1 ? "section" : "sections"}
                      </span>
                    </span>
                    {collapsed ? (
                      <ChevronDown className="size-4 shrink-0 text-foreground-muted" />
                    ) : (
                      <ChevronUp className="size-4 shrink-0 text-foreground-muted" />
                    )}
                  </button>
                  {!collapsed && (
                    <div className="grid gap-3 border-t border-border p-3 sm:grid-cols-2">
                      {cg.sections.map((section) => (
                        <div key={section.sectionId} className="rounded-lg border border-border p-3">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-sm font-semibold text-foreground">Section {section.sectionName}</p>
                            <span className="text-xs text-foreground-muted">
                              {section.subjects.length} {section.subjects.length === 1 ? "subject" : "subjects"}
                            </span>
                          </div>
                          <div className="mt-2 space-y-1.5">
                            {section.subjects.map((subject) => {
                              const tone = subjectTone(subject.subjectId);
                              return (
                                <div
                                  key={subject.subjectId}
                                  className="flex items-center gap-2 rounded-lg border border-border px-2.5 py-1.5 text-sm"
                                >
                                  <span className={`size-2 shrink-0 rounded-full ${SUBJECT_DOT_CLASSES[tone]}`} />
                                  <span className="truncate text-foreground">{subject.subjectName}</span>
                                  {canEditHere && editing && (
                                    <button
                                      type="button"
                                      className="ml-auto shrink-0 text-foreground-muted hover:text-danger"
                                      title="Delete this assignment"
                                      onClick={() => {
                                        const target = yearAssignments.find(
                                          (a) => a.section.id === section.sectionId && a.subject.id === subject.subjectId,
                                        );
                                        if (target) setDeleteTarget(target);
                                      }}
                                    >
                                      <Trash2 className="size-3.5" />
                                    </button>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {canEditHere && editing && (
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

// Exported for AssignExistingTeacherForm, which needs the identical
// subject checklist when assigning an existing teacher to a class/section
// here for the first time — same "one owning teacher per subject/section"
// rule, no reason to re-implement it.
export function ClassSubjectChecklist({
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
