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
import { useToast } from "@/components/ui/Toast";
import { StudentsTable } from "@/features/students/tables/StudentsTable";
import { DECORATIVE_TONE_PARTS } from "@/components/ui/decorativeTones";
import { ArrowLeftRight, GraduationCap, Pencil, Plus, Printer, Search, Trash2, Check, X } from "lucide-react";

type RosterAttendanceFilter = "ALL" | "EXCELLENT" | "GOOD" | "NEEDS_ATTENTION";

// A subtle, cycling visual identity per section card — decorative only,
// never a security boundary (isolation is enforced by classId/sectionId on
// every request, not by which color a card happens to be).
const SECTION_ACCENTS = [
  { soft: "bg-accent-soft", avatar: "bg-white text-accent" },
  { soft: "bg-success-soft", avatar: "bg-white text-success" },
  { soft: DECORATIVE_TONE_PARTS.violet.soft, avatar: `bg-white ${DECORATIVE_TONE_PARTS.violet.text}` },
  { soft: DECORATIVE_TONE_PARTS.amber.soft, avatar: `bg-white ${DECORATIVE_TONE_PARTS.amber.text}` },
] as const;

export default function ClassDetailPage({ params }: { params: Promise<{ id: string; classId: string }> }) {
  const { id: schoolId, classId } = use(params);
  const { user, accessToken } = useAuth();
  const { show } = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  // Carried over from the class list's own Academic Year selector via
  // "View Sections"/"Edit" (?year=...), so opening a class shows the same
  // year you were already looking at — falls back to the current year once
  // the year list loads, same as the list page and the Section Workspace.
  const yearFromUrl = searchParams.get("year");

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
  const [yearId, setYearId] = useState(yearFromUrl ?? "");
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
        api.listClasses(accessToken, schoolId),
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
  // power the same StudentsTable used on the school-wide Student List.
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
  const schoolName = user?.schools.find((s) => s.id === schoolId)?.name ?? "School";
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
  // StudentsTable — name/ID/roll/parent search is StudentsTable's own
  // built-in search, same as the school-wide Student List page.
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

            <Card padding="none">
              <CardHeader
                title="Sections"
                description={`${sections.length} section(s) in this class for ${yearName || "the selected year"} — each one is managed independently.`}
              />
              {sections.length === 0 ? (
                <div className="p-5">
                  <EmptyState icon={GraduationCap} title="No sections yet" description="Add a section below." />
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-3 p-5 sm:grid-cols-2 lg:grid-cols-3">
                  {sections.map((s, index) => {
                    const rows = assignmentsBySection[s.id];
                    const subjectsHere = new Set(rows?.map((r) => r.subjectId)).size;
                    const teachersHere = new Set(rows?.map((r) => r.teacher.id)).size;
                    const isEditing = editingSectionId === s.id;
                    const accent = SECTION_ACCENTS[index % SECTION_ACCENTS.length];
                    return (
                      <div key={s.id} className="rounded-xl border border-border p-4">
                        {isEditing ? (
                          <div className="space-y-2.5">
                            <Input
                              value={sectionEditName}
                              onChange={(e) => setSectionEditName(e.target.value)}
                              placeholder="Section name"
                            />
                            <Input
                              type="number"
                              min={1}
                              value={sectionEditCapacity}
                              onChange={(e) => setSectionEditCapacity(e.target.value)}
                              placeholder="Unlimited"
                            />
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
                          </div>
                        ) : (
                          <>
                            <div className={`-m-4 mb-0 rounded-t-xl border-b border-border px-4 py-3 ${accent.soft}`}>
                              <div className="flex items-center gap-3">
                                <div className={`flex size-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${accent.avatar}`}>
                                  {s.name.charAt(0).toUpperCase()}
                                </div>
                                <div className="min-w-0">
                                  <p className="truncate font-medium text-foreground">Section {s.name}</p>
                                  <p className="text-xs text-foreground-muted">{cls?.name}</p>
                                </div>
                              </div>
                            </div>

                            <div className="mt-3.5 grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
                              <Stat label="Students" value={s._count.enrollments} />
                              {s.capacity !== null && <Stat label="Capacity" value={s.capacity} />}
                              <Stat label="Subjects" value={rows ? subjectsHere : "…"} />
                              <Stat label="Teachers" value={rows ? teachersHere : "…"} />
                            </div>

                            <div className="mt-4 flex flex-wrap gap-1.5">
                              <Link
                                href={`/schools/${schoolId}/academic/classes/${classId}/sections/${s.id}${yearId ? `?year=${yearId}` : ""}`}
                                className="flex-1"
                              >
                                <Button size="sm" variant="outline" className="w-full">
                                  View Section
                                </Button>
                              </Link>
                              {canManage && (
                                <>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    icon={<Pencil className="size-4" />}
                                    onClick={() => startEditSection(s)}
                                    aria-label={`Edit Section ${s.name}`}
                                  />
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    icon={<Trash2 className="size-4" />}
                                    onClick={() => setDeleteSectionTarget(s)}
                                    aria-label={`Delete Section ${s.name}`}
                                  />
                                </>
                              )}
                            </div>
                          </>
                        )}
                      </div>
                    );
                  })}
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
                    <StudentsTable
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

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs text-foreground-muted">{label}</p>
      <p className="font-medium text-foreground">{value}</p>
    </div>
  );
}
