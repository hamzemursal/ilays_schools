"use client";

import { use, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth, ApiError } from "@/lib/auth-context";
import {
  api,
  type AcademicYear,
  type ClassBulkTransferImpact,
  type ClassSubjectRecord,
  type ClassWithSections,
  type Section,
  type SectionTeacherAssignment,
  type StudentListItem,
  type StudentStatus,
  type Subject,
} from "@/lib/api";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { EmptyState } from "@/components/ui/EmptyState";
import { FormField, Input, Select } from "@/components/ui/FormControls";
import { SkeletonCards } from "@/components/ui/Skeleton";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { ActionsMenu } from "@/components/ui/ActionsMenu";
import { useToast } from "@/components/ui/Toast";
import { ClassRosterTable } from "@/features/students/tables/ClassRosterTable";
import { classSlug as toClassSlug, slugify } from "@/lib/slug";
import {
  ArrowLeftRight,
  ArrowRight,
  BookOpen,
  GraduationCap,
  Layers,
  Pencil,
  Plus,
  Printer,
  Search,
  Trash2,
  Users,
  Check,
  X,
} from "lucide-react";

type RosterAttendanceFilter = "ALL" | "EXCELLENT" | "GOOD" | "NEEDS_ATTENTION";

// The URL segment for school/class (and the "?year=" query param) is a
// human-readable slug, not a raw id — "xaafuun", "secondary-1", "2027".
// This wrapper resolves each one to its real database id up front (the
// backend re-validates the exact same authorization it always has for
// every one of these lookups — see SchoolsService/ClassesService/
// AcademicYearsService's resolveIdentifierOrThrow methods) and only then
// renders the real page below, completely unchanged, working with real
// ids exactly as it always did. A real id (an old bookmarked link) works
// here too — the backend tries an id match before falling back to a slug.
export default function ClassDetailPage({ params }: { params: Promise<{ id: string; classId: string }> }) {
  const { id: schoolSlug, classId: classSlugParam } = use(params);
  const { accessToken } = useAuth();
  const searchParams = useSearchParams();
  const yearFromUrl = searchParams.get("year");

  const [resolved, setResolved] = useState<{
    schoolId: string;
    schoolName: string;
    classId: string;
    yearId: string | null;
  } | null>(null);
  const [resolveError, setResolveError] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken) return;
    let cancelled = false;
    // Resetting before a fresh resolve (not just on unmount) is deliberate —
    // navigating from one class's clean URL straight to another's must not
    // briefly render the previous class's now-stale resolved ids.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setResolved(null);
    setResolveError(null);
    (async () => {
      try {
        const school = await api.resolveSchool(accessToken, schoolSlug);
        // The year first: a class slug names one class per academic year.
        const year = yearFromUrl ? await api.resolveAcademicYear(accessToken, school.id, yearFromUrl) : null;
        const cls = await api.resolveClass(accessToken, school.id, classSlugParam, year?.id);
        if (!cancelled) {
          setResolved({ schoolId: school.id, schoolName: school.name, classId: cls.id, yearId: year?.id ?? null });
        }
      } catch (err) {
        if (!cancelled) setResolveError(err instanceof ApiError ? err.message : "Class not found");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [accessToken, schoolSlug, classSlugParam, yearFromUrl]);

  if (resolveError) {
    return (
      <div className="p-4 sm:p-6">
        <Alert tone="danger">{resolveError}</Alert>
      </div>
    );
  }
  if (!resolved) {
    return (
      <div className="p-4 sm:p-6">
        <SkeletonCards count={3} />
      </div>
    );
  }

  return (
    <ClassDetailPageInner
      schoolId={resolved.schoolId}
      schoolName={resolved.schoolName}
      classId={resolved.classId}
      initialYearId={resolved.yearId}
    />
  );
}

function ClassDetailPageInner({
  schoolId,
  schoolName,
  classId,
  initialYearId,
}: {
  schoolId: string;
  schoolName: string;
  classId: string;
  initialYearId: string | null;
}) {
  const { user, accessToken } = useAuth();
  const { show } = useToast();
  const router = useRouter();

  const [cls, setCls] = useState<ClassWithSections | null>(null);
  const [allClasses, setAllClasses] = useState<ClassWithSections[] | null>(null);
  const [sections, setSections] = useState<Section[] | null>(null);
  const [classStudents, setClassStudents] = useState<StudentListItem[] | null>(null);
  const [attendanceRates, setAttendanceRates] = useState<Map<string, number | null> | null>(null);
  const [rosterSectionId, setRosterSectionId] = useState("");
  const [rosterStatus, setRosterStatus] = useState<StudentStatus | "ALL">("ALL");
  const [rosterAttendance, setRosterAttendance] = useState<RosterAttendanceFilter>("ALL");
  const [subjects, setSubjects] = useState<ClassSubjectRecord[] | null>(null);
  const [allSubjects, setAllSubjects] = useState<Subject[]>([]);
  const [years, setYears] = useState<AcademicYear[]>([]);
  const [yearId, setYearId] = useState(initialYearId ?? "");
  const [assignmentsBySection, setAssignmentsBySection] = useState<Record<string, SectionTeacherAssignment[]>>({});
  const [error, setError] = useState<string | null>(null);

  const [sectionName, setSectionName] = useState("");
  const [sectionFormError, setSectionFormError] = useState<string | null>(null);
  const [sectionSearch, setSectionSearch] = useState("");
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

  const [showTransferForm, setShowTransferForm] = useState(false);
  const [transferMode, setTransferMode] = useState<"section" | "students">("section");
  const [transferYearId, setTransferYearId] = useState("");
  const [transferFromSectionId, setTransferFromSectionId] = useState("");
  const [transferToClassId, setTransferToClassId] = useState("");
  const [transferToSectionId, setTransferToSectionId] = useState("");
  const [studentSearch, setStudentSearch] = useState("");
  const [selectedEnrollmentIds, setSelectedEnrollmentIds] = useState<Set<string>>(new Set());
  const [loadingTransferImpact, setLoadingTransferImpact] = useState(false);
  const [transferImpact, setTransferImpact] = useState<ClassBulkTransferImpact | null>(null);
  const [selectedStudentsPreview, setSelectedStudentsPreview] = useState<StudentListItem[]>([]);
  const [transferError, setTransferError] = useState<string | null>(null);
  const [transferring, setTransferring] = useState(false);

  async function loadAll() {
    if (!accessToken) return;
    try {
      const [classes, subs, y, allSubj] = await Promise.all([
        api.listClasses(accessToken, schoolId, yearId || initialYearId || undefined),
        api.listClassSubjects(accessToken, schoolId, classId),
        api.listAcademicYears(accessToken, schoolId),
        api.listSubjects(accessToken, schoolId),
      ]);
      const found = classes.find((c) => c.id === classId);
      if (!found) {
        setError("Class not found");
        return;
      }
      setCls(found);
      setAllClasses(classes);
      setSubjects(subs);
      setYears(y);
      setAllSubjects(allSubj);
      setYearId((prev) => prev || (y.find((yr) => yr.isCurrent) ?? y[0])?.id || "");
      setTransferYearId((prev) => prev || (y.find((yr) => yr.isCurrent) ?? y[0])?.id || "");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load class");
    }
  }

  useEffect(() => {
    // loadAll is also called imperatively after a successful bulk transfer
    // (not just here on mount), which is exactly the "named loader" shape
    // the set-state-in-effect rule can't distinguish from a riskier pattern.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken, schoolId, classId]);

  // Section student counts (and therefore the roster below) must be scoped
  // to one academic year, the same way the class list page already is —
  // Class/Section are permanent structures reused every year, so without a
  // year filter a section with students actively enrolled in both 2026 and
  // 2027 would show both cohorts combined as one inflated number.
  useEffect(() => {
    if (!accessToken || !yearId) return;
    api.listSections(accessToken, schoolId, classId, yearId).then(setSections);
  }, [accessToken, schoolId, classId, yearId]);

  // listForSchool's classId filter is enforced on the enrollment's actual
  // classId column, not by matching Class.name/Section.name strings, so this
  // is exactly as safe as the section-by-section fetch it replaces — every
  // row here is still guaranteed to belong to this class, for this year —
  // while also giving the roster real attendance/status/guardian fields to
  // power ClassRosterTable.
  useEffect(() => {
    if (!accessToken || !cls || !yearId) return;
    api.listStudents(accessToken, schoolId, { academicYearId: yearId, classId }).then(setClassStudents);
  }, [accessToken, schoolId, classId, cls, yearId]);

  useEffect(() => {
    if (!accessToken || !yearId) return;
    api
      .getStudentAttendanceRates(accessToken, schoolId, yearId, classId)
      .then((rows) => setAttendanceRates(new Map(rows.map((r) => [r.enrollmentId, r.rate]))))
      // Same as the Student List page: attendance is an enhancement, not
      // core to the roster — a failure here just hides the Attendance
      // column/filter rather than breaking the class page.
      .catch(() => setAttendanceRates(null));
  }, [accessToken, schoolId, classId, yearId]);

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

  // Kept as its own name (rather than inlining transferToClassId
  // everywhere) since earlier this was mode-dependent; still handy as one
  // place to read "the destination class actually in effect."
  const effectiveToClassId = transferToClassId;
  const isSameClassTransfer = effectiveToClassId === classId;

  function toggleSelectedStudent(enrollmentId: string) {
    setSelectedEnrollmentIds((prev) => {
      const next = new Set(prev);
      if (next.has(enrollmentId)) next.delete(enrollmentId);
      else next.add(enrollmentId);
      return next;
    });
    setTransferImpact(null);
  }

  async function onPreviewTransfer() {
    if (!accessToken || !transferYearId || !effectiveToClassId || !transferToSectionId) return;
    setTransferError(null);

    if (transferMode === "students") {
      const chosen = classStudents?.filter((s) => selectedEnrollmentIds.has(s.enrollmentId)) ?? [];
      if (chosen.length === 0) return;
      setSelectedStudentsPreview(chosen);
      setTransferImpact({
        className: cls?.name ?? "",
        sectionName: null,
        academicYearName: years.find((y) => y.id === transferYearId)?.name ?? "",
        studentCount: chosen.length,
      });
      return;
    }

    setLoadingTransferImpact(true);
    try {
      const impact = await api.getClassBulkTransferImpact(
        accessToken,
        schoolId,
        classId,
        transferYearId,
        transferFromSectionId || undefined,
      );
      setTransferImpact(impact);
    } catch (err) {
      setTransferError(err instanceof ApiError ? err.message : "Failed to load transfer impact");
    } finally {
      setLoadingTransferImpact(false);
    }
  }

  async function onConfirmTransfer() {
    if (!accessToken || !transferYearId || !effectiveToClassId || !transferToSectionId) return;
    setTransferring(true);
    try {
      const result = await api.bulkTransferClass(accessToken, schoolId, classId, {
        academicYearId: transferYearId,
        fromSectionId: transferMode === "section" ? transferFromSectionId || undefined : undefined,
        enrollmentIds: transferMode === "students" ? Array.from(selectedEnrollmentIds) : undefined,
        toClassId: effectiveToClassId,
        toSectionId: transferToSectionId,
      });
      if (result.unassignedSubjects.length > 0) {
        show(
          `${result.movedCount} student(s) transferred. Note: the destination section still has no teacher assigned for ${result.unassignedSubjects.map((s) => s.subjectName).join(", ")}.`,
        );
      } else {
        show(`${result.movedCount} student(s) transferred.`);
      }
      setTransferImpact(null);
      setSelectedStudentsPreview([]);
      setShowTransferForm(false);
      setTransferFromSectionId("");
      setTransferToClassId("");
      setTransferToSectionId("");
      setSelectedEnrollmentIds(new Set());
      setStudentSearch("");
      await loadAll();
    } catch (err) {
      setTransferError(err instanceof ApiError ? err.message : "Failed to transfer students");
    } finally {
      setTransferring(false);
    }
  }

  const transferDestinationClass = allClasses?.find((c) => c.id === effectiveToClassId);
  const canManage = user?.permissions.includes("academic.manage") ?? false;
  const canBulkTransfer = (user?.permissions.includes("transfers.create") && user?.permissions.includes("transfers.approve")) ?? false;
  const yearName = years.find((y) => y.id === yearId)?.name ?? "";
  const unassignedSubjects = allSubjects.filter((s) => !subjects?.some((cs) => cs.subjectId === s.id));

  const studentSearchResults = (() => {
    const q = studentSearch.trim().toLowerCase();
    if (!q) return classStudents ?? [];
    return (classStudents ?? []).filter(
      (s) =>
        `${s.firstName} ${s.lastName}`.toLowerCase().includes(q) ||
        s.studentNumber.toLowerCase().includes(q) ||
        String(s.rollNumber).includes(q),
    );
  })();

  // Section/Status/Attendance narrow the roster before it reaches
  // ClassRosterTable — name/ID/roll/parent search is that table's own
  // built-in search.
  const filteredRoster = (classStudents ?? []).filter((s) => {
    if (rosterSectionId && s.sectionId !== rosterSectionId) return false;
    if (rosterStatus !== "ALL" && s.status !== rosterStatus) return false;
    if (rosterAttendance !== "ALL" && attendanceRates) {
      const rate = attendanceRates.get(s.enrollmentId);
      if (rate === undefined || rate === null) return false;
      if (rosterAttendance === "EXCELLENT" && rate < 90) return false;
      if (rosterAttendance === "GOOD" && (rate < 75 || rate >= 90)) return false;
      if (rosterAttendance === "NEEDS_ATTENTION" && rate >= 75) return false;
    }
    return true;
  });
  const rosterHasFilters = rosterSectionId !== "" || rosterStatus !== "ALL" || rosterAttendance !== "ALL";

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
          cls && (
            <>
              {years.length > 0 && (
                <Select value={yearId} onChange={(e) => setYearId(e.target.value)} className="w-auto">
                  {years.map((y) => (
                    <option key={y.id} value={y.id}>
                      {y.name}
                      {y.isCurrent ? " (current)" : ""}
                    </option>
                  ))}
                </Select>
              )}
              {canManage && (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    icon={<ArrowLeftRight className="size-4" />}
                    onClick={() => setShowTransferForm((v) => !v)}
                  >
                    Class Transfer
                  </Button>
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
              )}
            </>
          )
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

      <ConfirmDialog
        open={!!transferImpact}
        title={`Transfer ${transferImpact?.studentCount ?? 0} student(s) to ${transferDestinationClass?.name ?? "…"}?`}
        description={
          transferMode === "students" ? (
            <>
              <strong>{selectedStudentsPreview.length}</strong> selected student(s) —{" "}
              {selectedStudentsPreview.map((s) => `${s.firstName} ${s.lastName}`).join(", ")} — for academic year{" "}
              <strong>{transferImpact?.academicYearName}</strong> will move to{" "}
              <strong>
                {transferDestinationClass?.name} - Section{" "}
                {transferDestinationClass?.sections.find((s) => s.id === transferToSectionId)?.name}
              </strong>
              . Roll numbers will be reassigned. This cannot be undone.
            </>
          ) : (
            <>
              All <strong>{transferImpact?.studentCount ?? 0}</strong> active student(s) in{" "}
              <strong>
                {transferImpact?.className}
                {transferImpact?.sectionName ? ` - Section ${transferImpact.sectionName}` : ""}
              </strong>{" "}
              for academic year <strong>{transferImpact?.academicYearName}</strong> will move to{" "}
              <strong>
                {transferDestinationClass?.name} - Section{" "}
                {transferDestinationClass?.sections.find((s) => s.id === transferToSectionId)?.name}
              </strong>
              . Roll numbers will be reassigned. This cannot be undone.
            </>
          )
        }
        confirmLabel={transferMode === "students" ? "Transfer selected students" : "Transfer all students"}
        loading={transferring}
        onConfirm={onConfirmTransfer}
        onCancel={() => setTransferImpact(null)}
        requireTypedConfirmation={cls?.name}
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

            {showTransferForm && (
              <Card>
                <CardHeader
                  title="Class Transfer"
                  description="Move active students, for one academic year, into a different class and section — or reshuffle sections within this same class."
                />

                <div className="mt-4 flex gap-1 rounded-lg border border-border bg-surface-soft p-1">
                  {(
                    [
                      { key: "section" as const, label: "By section" },
                      { key: "students" as const, label: "Select specific students" },
                    ]
                  ).map((tab) => (
                    <button
                      key={tab.key}
                      type="button"
                      onClick={() => {
                        setTransferMode(tab.key);
                        setTransferToClassId("");
                        setTransferToSectionId("");
                        setSelectedEnrollmentIds(new Set());
                        setTransferImpact(null);
                      }}
                      className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                        transferMode === tab.key
                          ? "bg-background text-foreground shadow-sm"
                          : "text-foreground-soft hover:text-foreground"
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <FormField label="Academic year" required>
                    <Select
                      value={transferYearId}
                      onChange={(e) => {
                        setTransferYearId(e.target.value);
                        setTransferImpact(null);
                      }}
                    >
                      {years.map((y) => (
                        <option key={y.id} value={y.id}>
                          {y.name}
                          {y.isCurrent ? " (Current)" : ""}
                        </option>
                      ))}
                    </Select>
                  </FormField>

                  {transferMode === "section" && (
                    <FormField
                      label="Source section"
                      hint="Leave as “All sections” to move the whole class, or pick one section to reshuffle it — including into another section of this same class."
                    >
                      <Select
                        value={transferFromSectionId}
                        onChange={(e) => {
                          setTransferFromSectionId(e.target.value);
                          setTransferImpact(null);
                        }}
                      >
                        <option value="">All sections (whole class)</option>
                        {sections.map((s) => (
                          <option key={s.id} value={s.id}>
                            Section {s.name} only
                          </option>
                        ))}
                      </Select>
                    </FormField>
                  )}

                  <FormField label="Destination class" required>
                    <Select
                      value={transferToClassId}
                      onChange={(e) => {
                        setTransferToClassId(e.target.value);
                        setTransferToSectionId("");
                        setTransferImpact(null);
                      }}
                    >
                      <option value="">Select a class…</option>
                      {allClasses?.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.id === classId ? `${c.name} (same class)` : `${c.name} (${c.division.type})`}
                        </option>
                      ))}
                    </Select>
                  </FormField>
                  <FormField label="Destination section" required>
                    <Select
                      value={transferToSectionId}
                      onChange={(e) => {
                        setTransferToSectionId(e.target.value);
                        setTransferImpact(null);
                      }}
                      disabled={!transferDestinationClass}
                    >
                      <option value="">Select a section…</option>
                      {transferDestinationClass?.sections
                        .filter((s) => transferMode === "students" || !isSameClassTransfer || s.id !== transferFromSectionId)
                        .map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                            {s.capacity !== null ? ` (${s._count.enrollments}/${s.capacity})` : ""}
                          </option>
                        ))}
                    </Select>
                  </FormField>
                </div>

                {transferMode === "students" && (
                  <div className="mt-4">
                    <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-foreground-muted">
                      Find students by name, ID, or roll no.
                    </label>
                    <div className="relative">
                      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-foreground-muted" />
                      <Input
                        value={studentSearch}
                        onChange={(e) => setStudentSearch(e.target.value)}
                        placeholder="e.g. Amina, STU-2027-00003, or 12"
                        className="pl-9"
                      />
                    </div>
                    <div className="mt-2 max-h-64 overflow-y-auto rounded-lg border border-border">
                      {studentSearchResults.length === 0 ? (
                        <p className="p-4 text-center text-sm text-foreground-muted">No matching students.</p>
                      ) : (
                        <div className="divide-y divide-border">
                          {studentSearchResults.map((s) => (
                            <label
                              key={s.enrollmentId}
                              className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm hover:bg-surface-hover"
                            >
                              <input
                                type="checkbox"
                                checked={selectedEnrollmentIds.has(s.enrollmentId)}
                                onChange={() => toggleSelectedStudent(s.enrollmentId)}
                                className="size-4 rounded border-border"
                              />
                              <span className="w-10 shrink-0 tabular-nums text-foreground-muted">{s.rollNumber}</span>
                              <span className="w-28 shrink-0 truncate font-mono text-xs text-foreground-muted">
                                {s.studentNumber}
                              </span>
                              <span className="flex-1 truncate font-medium text-foreground">
                                {s.firstName} {s.lastName}
                              </span>
                              <span className="shrink-0 text-xs text-foreground-muted">Section {s.sectionName}</span>
                            </label>
                          ))}
                        </div>
                      )}
                    </div>
                    <p className="mt-1.5 text-xs text-foreground-muted">
                      {selectedEnrollmentIds.size} student(s) selected.
                    </p>
                  </div>
                )}

                {transferMode === "section" && isSameClassTransfer && !transferFromSectionId && (
                  <Alert tone="warning" className="mt-4">
                    Moving within the same class requires picking a specific source section above — not
                    &ldquo;All sections&rdquo;.
                  </Alert>
                )}
                {transferDestinationClass && !isSameClassTransfer && transferDestinationClass.division.type !== cls?.division.type && (
                  <Alert tone="danger" className="mt-4">
                    {cls?.name} is {cls?.division.type} and {transferDestinationClass.name} is{" "}
                    {transferDestinationClass.division.type} — Class Transfer can&apos;t cross divisions. Use Student
                    Lifecycle for a Primary-to-Secondary transition.
                  </Alert>
                )}
                {transferDestinationClass &&
                  !isSameClassTransfer &&
                  transferDestinationClass.division.type === cls?.division.type &&
                  transferDestinationClass.level !== cls?.level && (
                    <Alert tone="warning" className="mt-4">
                      {cls?.name} is Level {cls?.level} and {transferDestinationClass.name} is Level{" "}
                      {transferDestinationClass.level} — double-check this is a deliberate grade change, not a
                      mistake.
                    </Alert>
                  )}
                {transferError && (
                  <Alert tone="danger" className="mt-4">
                    {transferError}
                  </Alert>
                )}
                <div className="mt-4 flex gap-2">
                  <Button
                    size="sm"
                    loading={loadingTransferImpact}
                    disabled={
                      !transferYearId ||
                      !effectiveToClassId ||
                      !transferToSectionId ||
                      (transferMode === "section" && isSameClassTransfer && !transferFromSectionId) ||
                      (transferMode === "students" && selectedEnrollmentIds.size === 0) ||
                      (!!transferDestinationClass && transferDestinationClass.division.type !== cls?.division.type)
                    }
                    onClick={onPreviewTransfer}
                  >
                    Preview transfer
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setShowTransferForm(false);
                      setTransferError(null);
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </Card>
            )}

            <SectionsPanel
              sections={sections}
              search={sectionSearch}
              onSearchChange={setSectionSearch}
              cls={cls}
              schoolName={schoolName}
              yearName={yearName}
              isCurrentYear={years.find((y) => y.id === yearId)?.isCurrent ?? false}
              assignmentsBySection={assignmentsBySection}
              canManage={canManage}
              editingSectionId={editingSectionId}
              sectionEditName={sectionEditName}
              sectionEditCapacity={sectionEditCapacity}
              savingSectionId={savingSectionId}
              onStartEdit={startEditSection}
              onEditNameChange={setSectionEditName}
              onEditCapacityChange={setSectionEditCapacity}
              onSaveEdit={onSaveSection}
              onCancelEdit={() => setEditingSectionId(null)}
              onDelete={setDeleteSectionTarget}
              sectionName={sectionName}
              onSectionNameChange={setSectionName}
              onAddSection={onAddSection}
              sectionFormError={sectionFormError}
            />

            <Card padding="none">
              <CardHeader
                title="Students"
                description={
                  classStudents
                    ? `${classStudents.length} student(s) enrolled in this class for ${yearName || "the selected year"}.`
                    : undefined
                }
                actions={
                  classStudents &&
                  classStudents.length > 0 && (
                    <Button variant="outline" size="sm" icon={<Printer className="size-4" />} onClick={() => window.print()}>
                      Print
                    </Button>
                  )
                }
              />
              {!classStudents ? (
                <div className="p-5">
                  <SkeletonCards count={2} />
                </div>
              ) : classStudents.length === 0 ? (
                <div className="p-5">
                  <EmptyState icon={GraduationCap} title="No students enrolled in this class yet" />
                </div>
              ) : (
                <>
                  {sections && sections.length > 1 && (
                    <div className="flex flex-wrap items-end gap-3 border-b border-border p-4">
                      <FormField label="Section" className="w-auto">
                        <Select value={rosterSectionId} onChange={(e) => setRosterSectionId(e.target.value)} className="w-auto min-w-[130px]">
                          <option value="">All Sections</option>
                          {sections.map((s) => (
                            <option key={s.id} value={s.id}>
                              Section {s.name}
                            </option>
                          ))}
                        </Select>
                      </FormField>
                      <FormField label="Status" className="w-auto">
                        <Select value={rosterStatus} onChange={(e) => setRosterStatus(e.target.value as StudentStatus | "ALL")} className="w-auto min-w-[130px]">
                          <option value="ALL">All Status</option>
                          <option value="ACTIVE">Active</option>
                          <option value="COMPLETED">Completed</option>
                          <option value="GRADUATED">Graduated</option>
                          <option value="TRANSFERRED">Transferred</option>
                          <option value="WITHDRAWN">Withdrawn</option>
                          <option value="ARCHIVED">Archived</option>
                        </Select>
                      </FormField>
                      {attendanceRates && (
                        <FormField label="Attendance" className="w-auto">
                          <Select
                            value={rosterAttendance}
                            onChange={(e) => setRosterAttendance(e.target.value as RosterAttendanceFilter)}
                            className="w-auto min-w-[150px]"
                          >
                            <option value="ALL">All Attendance</option>
                            <option value="EXCELLENT">Excellent (90%+)</option>
                            <option value="GOOD">Good (75–89%)</option>
                            <option value="NEEDS_ATTENTION">Needs Attention (&lt;75%)</option>
                          </Select>
                        </FormField>
                      )}
                    </div>
                  )}
                  {rosterHasFilters && filteredRoster.length === 0 ? (
                    <div className="p-5">
                      <EmptyState title="No students match these filters" description="Try clearing a filter above." />
                    </div>
                  ) : (
                    <ClassRosterTable
                      schoolId={schoolId}
                      accessToken={accessToken ?? ""}
                      students={filteredRoster}
                      attendanceRates={attendanceRates}
                      canTransfer={canBulkTransfer}
                    />
                  )}
                </>
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

// The redesigned Sections area: search + a grid of modern Section cards +
// the create-section form. Pulled out of ClassDetailPageInner as its own
// named, exported component (same pattern as AcademicYearsSection in
// academic/page.tsx) purely so it — and each SectionCard's real counts,
// year-scoping, and Open Section/Edit/Delete wiring — can be unit-tested on
// its own, without dragging in the whole class page's roster/transfer state.
export function SectionsPanel({
  sections,
  search,
  onSearchChange,
  cls,
  schoolName,
  yearName,
  isCurrentYear,
  assignmentsBySection,
  canManage,
  editingSectionId,
  sectionEditName,
  sectionEditCapacity,
  savingSectionId,
  onStartEdit,
  onEditNameChange,
  onEditCapacityChange,
  onSaveEdit,
  onCancelEdit,
  onDelete,
  sectionName,
  onSectionNameChange,
  onAddSection,
  sectionFormError,
}: {
  sections: Section[];
  search: string;
  onSearchChange: (v: string) => void;
  cls: ClassWithSections | null;
  schoolName: string;
  yearName: string;
  isCurrentYear: boolean;
  assignmentsBySection: Record<string, SectionTeacherAssignment[]>;
  canManage: boolean;
  editingSectionId: string | null;
  sectionEditName: string;
  sectionEditCapacity: string;
  savingSectionId: string | null;
  onStartEdit: (s: Section) => void;
  onEditNameChange: (v: string) => void;
  onEditCapacityChange: (v: string) => void;
  onSaveEdit: (sectionId: string) => void;
  onCancelEdit: () => void;
  onDelete: (s: Section) => void;
  sectionName: string;
  onSectionNameChange: (v: string) => void;
  onAddSection: (e: FormEvent) => void;
  sectionFormError: string | null;
}) {
  const q = search.trim().toLowerCase();
  const filteredSections = q ? sections.filter((s) => s.name.toLowerCase().includes(q)) : sections;

  return (
    <Card padding="none">
      <CardHeader
        title="Classes & Sections"
        description={`${sections.length} section(s) in this class for ${yearName || "the selected year"} — each one is managed independently.`}
      />

      {sections.length > 1 && (
        <div className="border-b border-border px-5 py-3">
          <div className="relative max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-foreground-muted" />
            <Input
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Search sections…"
              className="pl-9"
              aria-label="Search sections"
            />
          </div>
        </div>
      )}

      {sections.length === 0 ? (
        <div className="p-5">
          <EmptyState icon={Layers} title="No sections yet" description="Create the first section below." />
        </div>
      ) : filteredSections.length === 0 ? (
        <div className="p-5">
          <EmptyState icon={Search} title="No sections match your search" description="Try a different section name." />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2 lg:grid-cols-3">
          {filteredSections.map((s) => {
            const rows = assignmentsBySection[s.id];
            const subjectsHere = new Set(rows?.map((r) => r.subjectId)).size;
            const teachersHere = new Set(rows?.map((r) => r.teacher.id)).size;
            return (
              <SectionCard
                key={s.id}
                section={s}
                classDisplayName={cls?.name ?? ""}
                yearName={yearName}
                isCurrentYear={isCurrentYear}
                subjectsCount={rows ? subjectsHere : null}
                teachersCount={rows ? teachersHere : null}
                openHref={`/schools/${slugify(schoolName)}/academic/classes/${cls ? toClassSlug(cls.division.type, cls.level) : ""}/sections/${slugify(s.name)}${yearName ? `?year=${encodeURIComponent(yearName)}` : ""}`}
                canManage={canManage}
                isEditing={editingSectionId === s.id}
                editName={sectionEditName}
                editCapacity={sectionEditCapacity}
                saving={savingSectionId === s.id}
                onEditNameChange={onEditNameChange}
                onEditCapacityChange={onEditCapacityChange}
                onStartEdit={() => onStartEdit(s)}
                onSaveEdit={() => onSaveEdit(s.id)}
                onCancelEdit={onCancelEdit}
                onDelete={() => onDelete(s)}
              />
            );
          })}
        </div>
      )}

      {canManage && (
        <form onSubmit={onAddSection} className="flex flex-wrap items-end gap-2 border-t border-border bg-surface-soft p-5">
          <FormField label="Create Section" htmlFor="new-section-name" className="max-w-[200px]">
            <Input
              id="new-section-name"
              value={sectionName}
              onChange={(e) => onSectionNameChange(e.target.value)}
              placeholder="Section name, e.g. F"
            />
          </FormField>
          <Button type="submit" size="sm" icon={<Plus className="size-4" />}>
            Create Section
          </Button>
          {sectionFormError && <p className="w-full text-sm text-danger">{sectionFormError}</p>}
        </form>
      )}
    </Card>
  );
}

function SectionCard({
  section,
  classDisplayName,
  yearName,
  isCurrentYear,
  subjectsCount,
  teachersCount,
  openHref,
  canManage,
  isEditing,
  editName,
  editCapacity,
  saving,
  onEditNameChange,
  onEditCapacityChange,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
  onDelete,
}: {
  section: Section;
  classDisplayName: string;
  yearName: string;
  isCurrentYear: boolean;
  subjectsCount: number | null;
  teachersCount: number | null;
  openHref: string;
  canManage: boolean;
  isEditing: boolean;
  editName: string;
  editCapacity: string;
  saving: boolean;
  onEditNameChange: (v: string) => void;
  onEditCapacityChange: (v: string) => void;
  onStartEdit: () => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  onDelete: () => void;
}) {
  if (isEditing) {
    return (
      <div className="rounded-2xl border border-border bg-background p-4 shadow-sm">
        <div className="space-y-2.5">
          <Input value={editName} onChange={(e) => onEditNameChange(e.target.value)} placeholder="Section name" />
          <Input
            type="number"
            min={1}
            value={editCapacity}
            onChange={(e) => onEditCapacityChange(e.target.value)}
            placeholder="Unlimited"
          />
          <div className="flex justify-end gap-1.5">
            <Button
              size="sm"
              variant="ghost"
              icon={<Check className="size-4" />}
              loading={saving}
              disabled={!editName.trim()}
              onClick={onSaveEdit}
              aria-label="Save"
            />
            <Button size="sm" variant="ghost" icon={<X className="size-4" />} onClick={onCancelEdit} disabled={saving} aria-label="Cancel" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col rounded-2xl border border-border bg-background p-5 shadow-sm transition-shadow hover:shadow-md">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent">
            <Layers className="size-5" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="truncate text-base font-semibold text-foreground">Section {section.name}</h3>
              <Badge tone={isCurrentYear ? "success" : "neutral"}>{isCurrentYear ? "Active" : "Previous Year"}</Badge>
            </div>
            <p className="mt-0.5 truncate text-xs text-foreground-muted">
              {classDisplayName}
              {yearName ? ` · ${yearName}` : ""}
            </p>
          </div>
        </div>
        {canManage && (
          <ActionsMenu
            label={`More actions for Section ${section.name}`}
            items={[{ label: "Delete", icon: Trash2, tone: "danger", onClick: onDelete }]}
          />
        )}
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2 rounded-xl bg-surface-soft p-3">
        <SectionStat
          icon={Users}
          label="Students"
          value={section.capacity !== null ? `${section._count.enrollments}/${section.capacity}` : section._count.enrollments}
        />
        <SectionStat icon={BookOpen} label="Subjects" value={subjectsCount ?? "…"} />
        <SectionStat icon={GraduationCap} label="Teachers" value={teachersCount ?? "…"} />
      </div>

      <div className="mt-4 flex gap-2">
        <Link href={openHref} className="flex-1">
          <Button size="sm" className="w-full" icon={<ArrowRight className="size-4" />}>
            Open Section
          </Button>
        </Link>
        {canManage && (
          <Button size="sm" variant="outline" icon={<Pencil className="size-4" />} onClick={onStartEdit} aria-label={`Edit Section ${section.name}`}>
            Edit
          </Button>
        )}
      </div>
    </div>
  );
}

function SectionStat({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-1 text-center">
      <Icon className="size-4 text-accent" />
      <p className="text-sm font-semibold tabular-nums text-foreground">{value}</p>
      <p className="text-[11px] text-foreground-muted">{label}</p>
    </div>
  );
}
