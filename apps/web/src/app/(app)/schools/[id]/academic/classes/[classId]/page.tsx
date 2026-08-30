"use client";

import { use, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth, ApiError } from "@/lib/auth-context";
import {
  api,
  type AcademicYear,
  type ClassSubjectRecord,
  type ClassWithSections,
  type Section,
  type SectionTeacherAssignment,
  type Subject,
} from "@/lib/api";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input, Select } from "@/components/ui/FormControls";
import { SkeletonCards } from "@/components/ui/Skeleton";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useToast } from "@/components/ui/Toast";
import { GraduationCap, Pencil, Plus, Trash2, Check, X } from "lucide-react";

export default function ClassDetailPage({ params }: { params: Promise<{ id: string; classId: string }> }) {
  const { id: schoolId, classId } = use(params);
  const { user, accessToken } = useAuth();
  const { show } = useToast();
  const router = useRouter();

  const [cls, setCls] = useState<ClassWithSections | null>(null);
  const [sections, setSections] = useState<Section[] | null>(null);
  const [subjects, setSubjects] = useState<ClassSubjectRecord[] | null>(null);
  const [allSubjects, setAllSubjects] = useState<Subject[]>([]);
  const [years, setYears] = useState<AcademicYear[]>([]);
  const [yearId, setYearId] = useState("");
  const [assignmentsBySection, setAssignmentsBySection] = useState<Record<string, SectionTeacherAssignment[]>>({});
  const [error, setError] = useState<string | null>(null);

  const [sectionName, setSectionName] = useState("");
  const [sectionFormError, setSectionFormError] = useState<string | null>(null);
  const [pickSubjectId, setPickSubjectId] = useState("");
  const [assigning, setAssigning] = useState(false);

  const [editingClassName, setEditingClassName] = useState(false);
  const [classNameDraft, setClassNameDraft] = useState("");
  const [savingClassName, setSavingClassName] = useState(false);
  const [showDeleteClass, setShowDeleteClass] = useState(false);
  const [deletingClass, setDeletingClass] = useState(false);

  const [editingSectionId, setEditingSectionId] = useState<string | null>(null);
  const [sectionEditName, setSectionEditName] = useState("");
  const [sectionEditCapacity, setSectionEditCapacity] = useState("");
  const [savingSectionId, setSavingSectionId] = useState<string | null>(null);
  const [deleteSectionTarget, setDeleteSectionTarget] = useState<Section | null>(null);
  const [deletingSectionId, setDeletingSectionId] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken) return;
    Promise.all([
      api.listClasses(accessToken, schoolId),
      api.listSections(accessToken, schoolId, classId),
      api.listClassSubjects(accessToken, schoolId, classId),
      api.listAcademicYears(accessToken, schoolId),
      api.listSubjects(accessToken, schoolId),
    ])
      .then(([classes, secs, subs, y, allSubj]) => {
        const found = classes.find((c) => c.id === classId);
        if (!found) {
          setError("Class not found");
          return;
        }
        setCls(found);
        setSections(secs);
        setSubjects(subs);
        setYears(y);
        setAllSubjects(allSubj);
        const current = y.find((yr) => yr.isCurrent) ?? y[0];
        if (current) setYearId(current.id);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load class"));
  }, [accessToken, schoolId, classId]);

  useEffect(() => {
    if (!accessToken || !sections || !yearId) return;
    Promise.all(
      sections.map((s) =>
        api
          .listSectionTeacherAssignments(accessToken, schoolId, classId, s.id, yearId)
          .then((rows) => [s.id, rows] as const),
      ),
    ).then((entries) => setAssignmentsBySection(Object.fromEntries(entries)));
  }, [accessToken, schoolId, classId, sections, yearId]);

  async function onAddSection(e: FormEvent) {
    e.preventDefault();
    if (!accessToken || !sectionName.trim()) return;
    setSectionFormError(null);
    try {
      const section = await api.createSection(accessToken, schoolId, classId, { name: sectionName.trim() });
      setSections((prev) => (prev ? [...prev, section] : [section]));
      setSectionName("");
      show(`Section ${section.name} added.`);
    } catch (err) {
      setSectionFormError(err instanceof ApiError ? err.message : "Failed to add section");
    }
  }

  async function onAssignSubject() {
    if (!accessToken || !pickSubjectId) return;
    setAssigning(true);
    try {
      const record = await api.assignSubjectToClass(accessToken, schoolId, classId, pickSubjectId);
      setSubjects((prev) => (prev ? [...prev, record] : [record]));
      setPickSubjectId("");
      show("Subject assigned to class.");
    } catch (err) {
      show(err instanceof ApiError ? err.message : "Failed to assign subject", "danger");
    } finally {
      setAssigning(false);
    }
  }

  async function onUnassignSubject(subjectId: string) {
    if (!accessToken) return;
    try {
      await api.unassignSubjectFromClass(accessToken, schoolId, classId, subjectId);
      setSubjects((prev) => prev?.filter((cs) => cs.subjectId !== subjectId) ?? prev);
    } catch (err) {
      show(err instanceof ApiError ? err.message : "Failed to remove subject", "danger");
    }
  }

  function startRenameClass() {
    if (!cls) return;
    setClassNameDraft(cls.name);
    setEditingClassName(true);
  }

  async function onSaveClassName() {
    if (!accessToken || !cls || !classNameDraft.trim()) return;
    setSavingClassName(true);
    try {
      const updated = await api.updateClass(accessToken, schoolId, classId, { name: classNameDraft.trim() });
      setCls(updated);
      setEditingClassName(false);
      show("Class renamed.");
    } catch (err) {
      show(err instanceof ApiError ? err.message : "Failed to rename class", "danger");
    } finally {
      setSavingClassName(false);
    }
  }

  async function onDeleteClass() {
    if (!accessToken) return;
    setDeletingClass(true);
    try {
      await api.removeClass(accessToken, schoolId, classId);
      show("Class deleted.");
      router.push(`/schools/${schoolId}/academic`);
    } catch (err) {
      show(err instanceof ApiError ? err.message : "Failed to delete class", "danger");
      setShowDeleteClass(false);
    } finally {
      setDeletingClass(false);
    }
  }

  function startEditSection(s: Section) {
    setEditingSectionId(s.id);
    setSectionEditName(s.name);
    setSectionEditCapacity(s.capacity === null ? "" : String(s.capacity));
  }

  async function onSaveSection(sectionId: string) {
    if (!accessToken || !sectionEditName.trim()) return;
    setSavingSectionId(sectionId);
    try {
      const updated = await api.updateSection(accessToken, schoolId, classId, sectionId, {
        name: sectionEditName.trim(),
        capacity: sectionEditCapacity.trim() === "" ? null : Number(sectionEditCapacity),
      });
      setSections((prev) => prev?.map((s) => (s.id === sectionId ? updated : s)) ?? prev);
      setEditingSectionId(null);
      show(`Section ${updated.name} updated.`);
    } catch (err) {
      show(err instanceof ApiError ? err.message : "Failed to update section", "danger");
    } finally {
      setSavingSectionId(null);
    }
  }

  async function onDeleteSection() {
    if (!accessToken || !deleteSectionTarget) return;
    setDeletingSectionId(deleteSectionTarget.id);
    try {
      await api.removeSection(accessToken, schoolId, classId, deleteSectionTarget.id);
      setSections((prev) => prev?.filter((s) => s.id !== deleteSectionTarget.id) ?? prev);
      show(`Section ${deleteSectionTarget.name} deleted.`);
      setDeleteSectionTarget(null);
    } catch (err) {
      show(err instanceof ApiError ? err.message : "Failed to delete section", "danger");
    } finally {
      setDeletingSectionId(null);
    }
  }

  const schoolName = user?.schools.find((s) => s.id === schoolId)?.name ?? "School";
  const canManage = user?.permissions.includes("academic.manage") ?? false;
  const unassignedSubjects = allSubjects.filter((s) => !subjects?.some((cs) => cs.subjectId === s.id));

  if (error) {
    return (
      <div className="p-4 sm:p-6">
        <Alert tone="danger">{error}</Alert>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        eyebrow="Class"
        title={cls ? cls.name : "Loading…"}
        description={cls ? `${cls.division.type} · Level ${cls.level}` : undefined}
        breadcrumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Academic", href: `/schools/${schoolId}/academic` },
          { label: schoolName },
        ]}
        actions={
          cls && canManage ? (
            <>
              <Button variant="outline" size="sm" icon={<Pencil className="size-4" />} onClick={startRenameClass}>
                Rename
              </Button>
              <Button
                variant="danger"
                size="sm"
                icon={<Trash2 className="size-4" />}
                onClick={() => setShowDeleteClass(true)}
              >
                Delete
              </Button>
            </>
          ) : undefined
        }
      />

      <ConfirmDialog
        open={showDeleteClass}
        title={`Delete ${cls?.name ?? "this class"} permanently?`}
        description="This permanently removes the class and its sections and subject links from the database. This action cannot be undone. Deletion is only possible if no student has ever been enrolled in this class."
        confirmLabel="Delete permanently"
        loading={deletingClass}
        onConfirm={onDeleteClass}
        onCancel={() => setShowDeleteClass(false)}
      />

      <ConfirmDialog
        open={!!deleteSectionTarget}
        title={`Delete section ${deleteSectionTarget?.name ?? ""} permanently?`}
        description="This permanently removes the section from the database. This action cannot be undone. Deletion is only possible if no student has ever been enrolled in this section."
        confirmLabel="Delete permanently"
        loading={!!deletingSectionId}
        onConfirm={onDeleteSection}
        onCancel={() => setDeleteSectionTarget(null)}
      />

      <div className="space-y-5 p-4 sm:p-6">
        {!cls || !sections || !subjects ? (
          <SkeletonCards count={3} />
        ) : (
          <>
            {editingClassName && (
              <Card>
                <div className="flex flex-wrap items-end gap-2">
                  <div className="min-w-[200px] flex-1">
                    <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-foreground-muted">
                      Class name
                    </label>
                    <Input value={classNameDraft} onChange={(e) => setClassNameDraft(e.target.value)} />
                  </div>
                  <Button
                    size="sm"
                    icon={<Check className="size-4" />}
                    loading={savingClassName}
                    disabled={!classNameDraft.trim()}
                    onClick={onSaveClassName}
                  >
                    Save
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    icon={<X className="size-4" />}
                    onClick={() => setEditingClassName(false)}
                    disabled={savingClassName}
                  >
                    Cancel
                  </Button>
                </div>
              </Card>
            )}

            <Card padding="none">
              <CardHeader title="Sections" description={`${sections.length} section(s) in this class.`} />
              {sections.length === 0 ? (
                <div className="p-5">
                  <EmptyState icon={GraduationCap} title="No sections yet" description="Add a section below." />
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[480px] text-left text-sm">
                    <thead className="bg-surface-soft text-xs font-semibold uppercase tracking-wide text-foreground-muted">
                      <tr>
                        <th className="px-5 py-2.5">Section</th>
                        <th className="px-5 py-2.5">Capacity</th>
                        <th className="px-5 py-2.5">Enrolled</th>
                        {canManage && <th className="px-5 py-2.5 text-right">Actions</th>}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {sections.map((s) =>
                        editingSectionId === s.id ? (
                          <tr key={s.id}>
                            <td className="px-5 py-2.5">
                              <Input
                                value={sectionEditName}
                                onChange={(e) => setSectionEditName(e.target.value)}
                                className="max-w-[120px]"
                              />
                            </td>
                            <td className="px-5 py-2.5">
                              <Input
                                type="number"
                                min={1}
                                value={sectionEditCapacity}
                                onChange={(e) => setSectionEditCapacity(e.target.value)}
                                placeholder="Unlimited"
                                className="max-w-[120px]"
                              />
                            </td>
                            <td className="px-5 py-2.5 text-foreground-soft">{s._count.enrollments}</td>
                            <td className="px-5 py-2.5">
                              <div className="flex justify-end gap-1.5">
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  icon={<Check className="size-4" />}
                                  loading={savingSectionId === s.id}
                                  disabled={!sectionEditName.trim()}
                                  onClick={() => onSaveSection(s.id)}
                                  aria-label="Save"
                                />
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  icon={<X className="size-4" />}
                                  onClick={() => setEditingSectionId(null)}
                                  disabled={savingSectionId === s.id}
                                  aria-label="Cancel"
                                />
                              </div>
                            </td>
                          </tr>
                        ) : (
                          <tr key={s.id}>
                            <td className="px-5 py-3 font-medium text-foreground">{s.name}</td>
                            <td className="px-5 py-3 text-foreground-soft">{s.capacity === null ? "Unlimited" : s.capacity}</td>
                            <td className="px-5 py-3 text-foreground-soft">{s._count.enrollments}</td>
                            {canManage && (
                              <td className="px-5 py-3">
                                <div className="flex justify-end gap-1.5">
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    icon={<Pencil className="size-4" />}
                                    onClick={() => startEditSection(s)}
                                  >
                                    Edit
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="danger"
                                    icon={<Trash2 className="size-4" />}
                                    onClick={() => setDeleteSectionTarget(s)}
                                  >
                                    Delete
                                  </Button>
                                </div>
                              </td>
                            )}
                          </tr>
                        ),
                      )}
                    </tbody>
                  </table>
                </div>
              )}
              {canManage && (
                <form onSubmit={onAddSection} className="flex flex-wrap items-end gap-2 border-t border-border p-5">
                  <Input
                    value={sectionName}
                    onChange={(e) => setSectionName(e.target.value)}
                    placeholder="Section name, e.g. F"
                    className="max-w-[180px]"
                  />
                  <Button type="submit" size="sm" variant="outline" icon={<Plus className="size-4" />}>
                    Add section
                  </Button>
                  {sectionFormError && <p className="w-full text-sm text-danger">{sectionFormError}</p>}
                </form>
              )}
            </Card>

            <Card padding="none">
              <CardHeader title="Subjects taught" />
              <div className="p-5">
                {subjects.length === 0 ? (
                  <p className="text-sm text-foreground-muted">No subjects assigned yet.</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {subjects.map((cs) => (
                      <span
                        key={cs.subjectId}
                        className="inline-flex items-center gap-1 rounded-full bg-accent-soft px-2.5 py-0.5 text-xs font-medium text-accent"
                      >
                        <Link href={`/schools/${schoolId}/academic/subjects/${cs.subjectId}`} className="hover:underline">
                          {cs.subject.name}
                          {cs.subject.code && <span className="ml-1 font-mono">· {cs.subject.code}</span>}
                        </Link>
                        {canManage && (
                          <button
                            type="button"
                            onClick={() => onUnassignSubject(cs.subjectId)}
                            className="text-accent/70 hover:text-danger"
                            aria-label={`Remove ${cs.subject.name}`}
                          >
                            ×
                          </button>
                        )}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              {canManage && unassignedSubjects.length > 0 && (
                <div className="flex flex-wrap items-center gap-2 border-t border-border p-5">
                  <Select value={pickSubjectId} onChange={(e) => setPickSubjectId(e.target.value)} className="w-auto">
                    <option value="">Select a subject…</option>
                    {unassignedSubjects.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </Select>
                  <Button type="button" size="sm" variant="outline" loading={assigning} disabled={!pickSubjectId} onClick={onAssignSubject}>
                    Assign
                  </Button>
                </div>
              )}
            </Card>

            <Card padding="none">
              <CardHeader
                title="Teacher assignments"
                description="Who teaches what, per section, for a given academic year."
                actions={
                  years.length > 0 && (
                    <Select value={yearId} onChange={(e) => setYearId(e.target.value)} className="w-auto">
                      {years.map((y) => (
                        <option key={y.id} value={y.id}>
                          {y.name}
                        </option>
                      ))}
                    </Select>
                  )
                }
              />
              <div className="space-y-4 p-5">
                {sections.map((s) => {
                  const rows = assignmentsBySection[s.id];
                  return (
                    <div key={s.id}>
                      <p className="text-xs font-semibold uppercase tracking-wide text-foreground-muted">
                        Section {s.name}
                      </p>
                      {!rows ? (
                        <p className="mt-1 text-sm text-foreground-muted">Loading…</p>
                      ) : rows.length === 0 ? (
                        <p className="mt-1 text-sm text-foreground-muted">No teacher assigned yet for this year.</p>
                      ) : (
                        <div className="mt-1.5 flex flex-wrap gap-2">
                          {rows.map((r) => (
                            <Badge key={r.id}>
                              {r.subject.name} → {r.teacher.firstName} {r.teacher.lastName}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
