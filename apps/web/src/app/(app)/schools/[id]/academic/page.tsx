"use client";

import { use, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useAuth, ApiError } from "@/lib/auth-context";
import {
  api,
  type AcademicYear,
  type AcademicYearDeletionImpact,
  type ClassWithSections,
  type Division,
  type Exam,
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
import { BulkActionBar } from "@/components/ui/BulkActionBar";
import { useToast } from "@/components/ui/Toast";
import { ActionsMenu, type ActionsMenuItem } from "@/components/ui/ActionsMenu";
import { runBulkAction, summarizeBulkResult } from "@/lib/bulkAction";
import { ExamTermControl } from "@/features/exams/ExamTermControl";
import { ExamSubjectMarksEditor, marksConfigError } from "@/features/exams/ExamSubjectMarksEditor";
import { CalendarDays, Check, CheckCircle2, Pencil, Plus, Trash2 } from "lucide-react";

// "Classes & sections" was removed as a standalone tab — Classes/Forms and
// their Sections are now managed inside their own Academic Year's page
// (Academic Years -> a year -> Primary/Secondary -> Class/Form -> Sections),
// which reuses the exact same class-detail/section-workspace routes this
// tab used to link to. Nothing about those routes changed.
const TABS = ["Years", "Subjects", "Exams"] as const;
type Tab = (typeof TABS)[number];

export default function AcademicStructurePage({ params }: { params: Promise<{ id: string }> }) {
  const { id: schoolId } = use(params);
  const { user, accessToken } = useAuth();
  const searchParams = useSearchParams();

  const [divisions, setDivisions] = useState<Division[] | null>(null);
  const [years, setYears] = useState<AcademicYear[]>([]);
  const [classes, setClasses] = useState<ClassWithSections[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [exams, setExams] = useState<Exam[]>([]);
  const [error, setError] = useState<string | null>(null);
  const initialTab = TABS.find((t) => t === searchParams.get("tab")) ?? "Years";
  const [tab, setTab] = useState<Tab>(initialTab);

  useEffect(() => {
    if (!accessToken) return;
    // Deliberately not calling getSchool() here — that requires schools.view,
    // which a School Admin (the actual audience for this page) never has.
    // Everything this page needs is either scoped-by-URL or already on the
    // authenticated profile.
    Promise.all([
      api.listDivisions(accessToken, schoolId),
      api.listAcademicYears(accessToken, schoolId),
      api.listClasses(accessToken, schoolId),
      api.listSubjects(accessToken, schoolId),
      api.listExams(accessToken, schoolId),
    ])
      .then(([d, y, c, subj, ex]) => {
        setDivisions(d);
        setYears(y);
        setClasses(c);
        setSubjects(subj);
        setExams(ex);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load academic structure"));
  }, [accessToken, schoolId]);

  const canManage = user?.permissions.includes("academic.manage") ?? false;
  const schoolName = user?.schools.find((s) => s.id === schoolId)?.name ?? "School";

  return (
    <div>
      <PageHeader
        eyebrow="Academic structure"
        title={schoolName}
        breadcrumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "Academic" }]}
      />

      <div className="border-b border-border px-4 sm:px-6">
        <div className="flex gap-1 overflow-x-auto">
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`shrink-0 border-b-2 px-3 py-3 text-sm font-medium transition-colors ${
                tab === t ? "border-accent text-accent" : "border-transparent text-foreground-soft hover:text-foreground"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      <div className="p-4 sm:p-6">
        {error ? (
          <Alert tone="danger">{error}</Alert>
        ) : !divisions ? (
          <SkeletonCards count={3} />
        ) : (
          <>
            {tab === "Years" && (
              <AcademicYearsSection schoolId={schoolId} accessToken={accessToken!} years={years} setYears={setYears} canManage={canManage} />
            )}
            {tab === "Subjects" && (
              <SubjectsSection schoolId={schoolId} accessToken={accessToken!} subjects={subjects} setSubjects={setSubjects} canManage={canManage} />
            )}
            {tab === "Exams" && (
              <ExamsSection
                schoolId={schoolId}
                accessToken={accessToken!}
                years={years}
                classes={classes}
                subjects={subjects}
                exams={exams}
                setExams={setExams}
                canManage={user?.permissions.includes("results.approve") ?? false}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}

export function AcademicYearsSection({
  schoolId,
  accessToken,
  years,
  setYears,
  canManage,
}: {
  schoolId: string;
  accessToken: string;
  years: AcademicYear[];
  setYears: (fn: (prev: AcademicYear[]) => AcademicYear[]) => void;
  canManage: boolean;
}) {
  const { show } = useToast();
  const [showCreateModal, setShowCreateModal] = useState(false);

  const [loadingImpactFor, setLoadingImpactFor] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AcademicYear | null>(null);
  const [deletionImpact, setDeletionImpact] = useState<AcademicYearDeletionImpact | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function onSetCurrent(id: string) {
    const updated = await api.setCurrentAcademicYear(accessToken, schoolId, id);
    setYears((prev) => prev.map((y) => (y.id === id ? updated : { ...y, isCurrent: false })));
    show(`${updated.name} set as the current academic year.`);
  }

  async function onClickDelete(y: AcademicYear) {
    setLoadingImpactFor(y.id);
    try {
      const impact = await api.getAcademicYearDeletionImpact(accessToken, schoolId, y.id);
      setDeletionImpact(impact);
      setDeleteTarget(y);
    } catch (err) {
      show(err instanceof ApiError ? err.message : "Failed to load what this year contains", "danger");
    } finally {
      setLoadingImpactFor(null);
    }
  }

  async function onConfirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.deleteAcademicYear(accessToken, schoolId, deleteTarget.id);
      setYears((prev) => prev.filter((y) => y.id !== deleteTarget.id));
      show(`${deleteTarget.name} deleted successfully.`);
      setDeleteTarget(null);
      setDeletionImpact(null);
    } catch (err) {
      show(err instanceof ApiError ? err.message : "Failed to delete academic year", "danger");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-6">
      {canManage && (
        <div className="flex justify-end">
          <Button icon={<Plus className="size-4" />} onClick={() => setShowCreateModal(true)}>
            Create Academic Year
          </Button>
        </div>
      )}

      {years.length === 0 ? (
        <EmptyState title="No academic years yet" description="Add one to start enrolling students." />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {years.map((y) => (
            <AcademicYearCard
              key={y.id}
              schoolId={schoolId}
              accessToken={accessToken}
              year={y}
              canManage={canManage}
              deletingImpact={loadingImpactFor === y.id}
              onSetCurrent={() => onSetCurrent(y.id)}
              onDelete={() => onClickDelete(y)}
              onWeightsSaved={(updated) => setYears((prev) => prev.map((yr) => (yr.id === updated.id ? updated : yr)))}
            />
          ))}
        </div>
      )}

      <ConfirmDialog
        open={!!deleteTarget && !!deletionImpact}
        title={`Delete ${deleteTarget?.name ?? "this academic year"}?`}
        description={deletionImpact && <DeletionImpactSummary impact={deletionImpact} />}
        confirmLabel="Delete Academic Year"
        loading={deleting}
        requireTypedConfirmation={deleteTarget?.name}
        onConfirm={onConfirmDelete}
        onCancel={() => {
          setDeleteTarget(null);
          setDeletionImpact(null);
        }}
      />

      <CreateAcademicYearModal
        open={showCreateModal}
        schoolId={schoolId}
        accessToken={accessToken}
        onCreated={(year) => {
          setYears((prev) => [year, ...prev]);
          setShowCreateModal(false);
          show("Academic year added.");
        }}
        onClose={() => setShowCreateModal(false)}
      />
    </div>
  );
}

// A clean modal for the existing create-year fields/validation/API — moved
// out of the always-visible inline form at the bottom of the page so the
// Years tab reads as a list first, with creation as a deliberate action.
function CreateAcademicYearModal({
  open,
  schoolId,
  accessToken,
  onCreated,
  onClose,
}: {
  open: boolean;
  schoolId: string;
  accessToken: string;
  onCreated: (year: AcademicYear) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Reset the form fresh every time the modal opens — same render-time
  // state-adjustment pattern ConfirmDialog uses for its own typed-confirm
  // field, avoiding an extra render pass via an effect.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setName("");
      setStartDate("");
      setEndDate("");
      setFormError(null);
    }
  }

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    setSaving(true);
    try {
      const year = await api.createAcademicYear(accessToken, schoolId, { name, startDate, endDate });
      onCreated(year);
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Failed to create academic year");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/30 px-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-xl border border-border bg-background p-5 shadow-lg"
      >
        <h2 className="font-semibold text-foreground">Create Academic Year</h2>
        <p className="mt-1 text-sm text-foreground-soft">Add a new academic year for this school.</p>

        <form onSubmit={onSubmit} className="mt-4 space-y-3">
          <FormField label="Academic Year Name" htmlFor="newYearName" required>
            <Input id="newYearName" required autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="2027" />
          </FormField>
          <FormField label="Start Date" htmlFor="newYearStart" required>
            <Input id="newYearStart" required type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </FormField>
          <FormField label="End Date" htmlFor="newYearEnd" required>
            <Input id="newYearEnd" required type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </FormField>
          {formError && <Alert tone="danger">{formError}</Alert>}
          <div className="mt-2 flex justify-end gap-2">
            <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" size="sm" loading={saving}>
              Create Academic Year
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

// One academic year as a self-contained card. The current year gets a
// quietly highlighted card and a green "Current Year" badge with no
// competing action button; every other year reads "Previous Year" and keeps
// "Set as Current Year" one tap away in its own (...) menu instead of a
// permanent button competing for attention on every card in the grid.
function AcademicYearCard({
  schoolId,
  accessToken,
  year,
  canManage,
  deletingImpact,
  onSetCurrent,
  onDelete,
  onWeightsSaved,
}: {
  schoolId: string;
  accessToken: string;
  year: AcademicYear;
  canManage: boolean;
  deletingImpact: boolean;
  onSetCurrent: () => void;
  onDelete: () => void;
  onWeightsSaved: (updated: AcademicYear) => void;
}) {
  const isCurrent = year.isCurrent;

  const menuItems: ActionsMenuItem[] = [
    ...(isCurrent ? [] : [{ label: "Set as Current Year", icon: CheckCircle2, onClick: onSetCurrent }]),
    { label: "Delete", icon: Trash2, tone: "danger" as const, onClick: onDelete },
  ];

  return (
    <Card padding="none" className={`overflow-hidden ${isCurrent ? "border-accent/30 bg-accent-soft/15 ring-1 ring-accent/15" : ""}`}>
      <div className="flex items-start justify-between gap-3 p-5">
        <Link
          href={`/schools/${schoolId}/academic/years/${year.id}`}
          className="flex min-w-0 flex-1 items-start gap-3"
          aria-label={`Open ${year.name}`}
        >
          <div
            className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${
              isCurrent ? "bg-accent text-white" : "bg-surface text-foreground-muted"
            }`}
          >
            <CalendarDays className="size-5" />
          </div>
          <div className="min-w-0">
            <Badge tone={isCurrent ? "success" : "neutral"}>{isCurrent ? "Current Year" : "Previous Year"}</Badge>
            <p className="mt-1.5 truncate text-lg font-semibold text-foreground">{year.name}</p>
            <p className="text-sm text-foreground-soft">
              {new Date(year.startDate).toLocaleDateString()} – {new Date(year.endDate).toLocaleDateString()}
            </p>
          </div>
        </Link>
        {canManage &&
          (deletingImpact ? (
            <div className="flex size-8 shrink-0 items-center justify-center" aria-label={`Loading actions for ${year.name}`}>
              <span className="size-4 animate-spin rounded-full border-2 border-border border-t-accent" aria-hidden />
            </div>
          ) : (
            <ActionsMenu label={`Actions for ${year.name}`} items={menuItems} />
          ))}
      </div>

      <TermWeightsEditor schoolId={schoolId} accessToken={accessToken} year={year} canManage={canManage} onSaved={onWeightsSaved} />
    </Card>
  );
}

// Every Academic Year has exactly Term 1 and Term 2 — this is the only
// place their weighting can change (there's deliberately no way to add a
// third term or remove one). Both weights are edited together and must sum
// to exactly 100 before Save is even enabled, so it's never possible to
// submit a year where the two terms disagree about how much of it they cover.
export function TermWeightsEditor({
  schoolId,
  accessToken,
  year,
  canManage,
  onSaved,
}: {
  schoolId: string;
  accessToken: string;
  year: AcademicYear;
  canManage: boolean;
  onSaved: (updated: AcademicYear) => void;
}) {
  // Defensive: some callers resolve a year through an endpoint that may not
  // always include `terms` (e.g. a resolve-by-identifier lookup) — never
  // assume it's present, even though the AcademicYear type declares it as
  // required. Missing terms render nothing below instead of crashing.
  const term1 = year.terms?.find((t) => t.name === "Term 1");
  const term2 = year.terms?.find((t) => t.name === "Term 2");
  const [editing, setEditing] = useState(false);
  const [term1Weight, setTerm1Weight] = useState(String(term1?.weight ?? 50));
  const [term2Weight, setTerm2Weight] = useState(String(term2?.weight ?? 50));
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const { show } = useToast();

  if (!term1 || !term2) return null;

  const sum = (Number(term1Weight) || 0) + (Number(term2Weight) || 0);
  const validSum = sum === 100;

  function startEditing() {
    setTerm1Weight(String(term1!.weight));
    setTerm2Weight(String(term2!.weight));
    setSaveError(null);
    setEditing(true);
  }

  async function onSave() {
    if (!validSum) return;
    setSaving(true);
    setSaveError(null);
    try {
      const updated = await api.updateTermWeights(accessToken, schoolId, year.id, {
        term1Weight: Number(term1Weight),
        term2Weight: Number(term2Weight),
      });
      onSaved(updated);
      setEditing(false);
      show(`${year.name}'s term weights updated.`);
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : "Failed to update term weights");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="border-t border-border px-5 py-4">
      {!editing ? (
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="accent">Term 1 — {term1.weight}%</Badge>
          <Badge tone="accent">Term 2 — {term2.weight}%</Badge>
          {canManage && (
            <Button size="sm" variant="ghost" icon={<Pencil className="size-3.5" />} onClick={startEditing}>
              Edit weights
            </Button>
          )}
        </div>
      ) : (
        <div className="flex flex-wrap items-end gap-3">
          <FormField label="Term 1 weight" htmlFor={`term1Weight-${year.id}`} className="w-32">
            <Input
              id={`term1Weight-${year.id}`}
              type="number"
              min={0}
              max={100}
              value={term1Weight}
              onChange={(e) => setTerm1Weight(e.target.value)}
            />
          </FormField>
          <FormField label="Term 2 weight" htmlFor={`term2Weight-${year.id}`} className="w-32">
            <Input
              id={`term2Weight-${year.id}`}
              type="number"
              min={0}
              max={100}
              value={term2Weight}
              onChange={(e) => setTerm2Weight(e.target.value)}
            />
          </FormField>
          <Button size="sm" loading={saving} disabled={!validSum} onClick={onSave}>
            Save
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
            Cancel
          </Button>
          {!validSum && <p className="w-full text-sm text-danger">Term 1 and Term 2 weights must sum to exactly 100 (currently {sum}).</p>}
          {saveError && <p className="w-full text-sm text-danger">{saveError}</p>}
        </div>
      )}
    </div>
  );
}

// Every number here is a real count from the impact-preview endpoint — an
// academic year is never blocked from deletion just for having history
// (unlike School/Class/Section elsewhere in this app), so this is the one
// real warning standing between a click and permanently losing it all.
// Classes and Sections are deliberately not listed: they belong to a
// Division, not this year, and nothing here touches them.
function DeletionImpactSummary({ impact }: { impact: AcademicYearDeletionImpact }) {
  const allRows: Array<[string, number]> = [
    ["Student enrollments", impact.counts.enrollments],
    ["Teacher assignments", impact.counts.teacherAssignments],
    ["Exams", impact.counts.exams],
    ["Exam subjects", impact.counts.examSubjects],
    ["Result records", impact.counts.results],
    ["Attendance records", impact.counts.attendanceRecords],
    ["Fee structures", impact.counts.feeStructures],
    ["Invoices", impact.counts.invoices],
    ["Payments", impact.counts.payments],
    ["Transfers", impact.counts.transfers],
    ["Promotion records", impact.counts.promotionItems],
  ];
  const rows = allRows.filter(([, count]) => count > 0);

  return (
    <div>
      {rows.length === 0 ? (
        <p>This academic year has no related records yet — deleting it is safe.</p>
      ) : (
        <>
          <p className="font-medium text-foreground">
            This permanently deletes the academic year and everything below. This action cannot be undone.
          </p>
          <ul className="mt-1.5 list-inside list-disc space-y-0.5">
            {rows.map(([label, count]) => (
              <li key={label}>
                {count.toLocaleString()} {label}
              </li>
            ))}
          </ul>
        </>
      )}
      {impact.academicYear.isCurrent && (
        <p className="mt-2 font-medium text-danger">
          This is the current academic year — deleting it may affect active school operations.
        </p>
      )}
    </div>
  );
}

function SubjectsSection({
  schoolId,
  accessToken,
  subjects,
  setSubjects,
  canManage,
}: {
  schoolId: string;
  accessToken: string;
  subjects: Subject[];
  setSubjects: (fn: (prev: Subject[]) => Subject[]) => void;
  canManage: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showBulkConfirm, setShowBulkConfirm] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Subject | null>(null);
  const [deleting, setDeleting] = useState(false);
  const { show } = useToast();

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    try {
      const subject = await api.createSubject(accessToken, schoolId, { name });
      setSubjects((prev) => [...prev, subject]);
      setName("");
      show(`${subject.name} added.`);
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Failed to create subject");
    }
  }

  function toggle(id: string, checked: boolean) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  async function onBulkDelete() {
    setBulkDeleting(true);
    try {
      const ids = Array.from(selectedIds);
      const result = await runBulkAction(ids, (id) => api.removeSubject(accessToken, schoolId, id));
      setSubjects((prev) => prev.filter((s) => !result.succeededIds.includes(s.id)));
      show(summarizeBulkResult(result, "deleted"));
      setSelectedIds(new Set());
      setShowBulkConfirm(false);
    } finally {
      setBulkDeleting(false);
    }
  }

  async function onDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.removeSubject(accessToken, schoolId, deleteTarget.id);
      setSubjects((prev) => prev.filter((s) => s.id !== deleteTarget.id));
      show(`${deleteTarget.name} deleted permanently.`);
      setDeleteTarget(null);
    } catch (err) {
      show(err instanceof ApiError ? err.message : "Failed to delete subject", "danger");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-5">
      <Card padding="none">
        <CardHeader
          title="Subjects"
          description="Every subject offered at this school."
          actions={
            canManage &&
            (editing ? (
              <Button size="sm" variant="outline" icon={<Check className="size-4" />} onClick={() => setEditing(false)}>
                Done
              </Button>
            ) : (
              <Button size="sm" variant="outline" icon={<Pencil className="size-4" />} onClick={() => setEditing(true)}>
                Edit
              </Button>
            ))
          }
        />
        <div className="p-5">
          {canManage && editing && (
            <BulkActionBar count={selectedIds.size} onClear={() => setSelectedIds(new Set())}>
              <Button size="sm" variant="danger" icon={<Trash2 className="size-4" />} onClick={() => setShowBulkConfirm(true)}>
                Delete selected
              </Button>
            </BulkActionBar>
          )}

          {subjects.length === 0 ? (
            <p className="text-sm text-foreground-muted">No subjects yet.</p>
          ) : editing ? (
            <div className="space-y-2">
              {subjects.map((s) => (
                <div key={s.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-border px-3 py-2">
                  {canManage && (
                    <input
                      type="checkbox"
                      checked={selectedIds.has(s.id)}
                      onChange={(e) => toggle(s.id, e.target.checked)}
                      aria-label={`Select ${s.name}`}
                      className="size-4 shrink-0 rounded border-border text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
                    />
                  )}
                  <Link
                    href={`/schools/${schoolId}/academic/subjects/${s.id}`}
                    className="flex-1 text-sm font-medium text-foreground hover:underline"
                  >
                    {s.name}
                    {s.code && <span className="ml-1 font-mono text-xs text-foreground-muted">· {s.code}</span>}
                  </Link>
                  <Button
                    size="sm"
                    variant="danger"
                    icon={<Trash2 className="size-4" />}
                    onClick={() => setDeleteTarget(s)}
                  >
                    Delete
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {subjects.map((s) => (
                <Link key={s.id} href={`/schools/${schoolId}/academic/subjects/${s.id}`}>
                  <Badge>
                    {s.name}
                    {s.code && <span className="ml-1 font-mono text-foreground-muted">· {s.code}</span>}
                  </Badge>
                </Link>
              ))}
            </div>
          )}

          {canManage && editing && (
            <form onSubmit={onCreate} className="mt-4 flex flex-wrap items-end gap-2 border-t border-border pt-4">
              <div>
                <Input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Mathematics" />
                <p className="mt-1 text-xs text-foreground-muted">A subject code is generated automatically.</p>
              </div>
              <Button type="submit" size="sm" icon={<Plus className="size-4" />}>
                Add subject
              </Button>
              {formError && <p className="w-full text-sm text-danger">{formError}</p>}
            </form>
          )}
        </div>
      </Card>

      <ConfirmDialog
        open={showBulkConfirm}
        title={`Delete ${selectedIds.size} subject${selectedIds.size === 1 ? "" : "s"}?`}
        description="This cannot be undone. Only subjects with no exam, teacher assignment, or class link will be deleted — the rest are skipped."
        confirmLabel="Delete"
        loading={bulkDeleting}
        onConfirm={onBulkDelete}
        onCancel={() => setShowBulkConfirm(false)}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        title={`Delete ${deleteTarget?.name ?? "this subject"} permanently?`}
        description="This action cannot be undone. Deletion is only possible if the subject has no dependent exams, teacher assignments, or class links."
        confirmLabel="Delete permanently"
        loading={deleting}
        onConfirm={onDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}

function ExamsSection({
  schoolId,
  accessToken,
  years,
  classes,
  subjects,
  exams,
  setExams,
  canManage,
}: {
  schoolId: string;
  accessToken: string;
  years: AcademicYear[];
  classes: ClassWithSections[];
  subjects: Subject[];
  exams: Exam[];
  setExams: (fn: (prev: Exam[]) => Exam[]) => void;
  canManage: boolean;
}) {
  return (
    <div className="space-y-5">
      {canManage && years.length > 0 && (
        <div className="flex justify-end">
          <Link href={`/schools/${schoolId}/academic/exams/new`}>
            <Button icon={<Plus className="size-4" />}>Create Exam</Button>
          </Link>
        </div>
      )}

      {exams.length === 0 ? (
        <EmptyState
          title="No exams yet"
          description={canManage ? "Create an exam to start scheduling classes and subjects for it." : "No exams have been scheduled yet."}
        />
      ) : (
        <div className="space-y-3">
          {exams.map((exam) => (
            <ExamRow
              key={exam.id}
              schoolId={schoolId}
              accessToken={accessToken}
              exam={exam}
              years={years}
              classes={classes}
              subjects={subjects}
              setExams={setExams}
              canManage={canManage}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ExamRow({
  schoolId,
  accessToken,
  exam,
  years,
  classes,
  subjects,
  setExams,
  canManage,
}: {
  schoolId: string;
  accessToken: string;
  exam: Exam;
  years: AcademicYear[];
  classes: ClassWithSections[];
  subjects: Subject[];
  setExams: (fn: (prev: Exam[]) => Exam[]) => void;
  canManage: boolean;
}) {
  const [classId, setClassId] = useState(classes[0]?.id ?? "");
  const [subjectId, setSubjectId] = useState(subjects[0]?.id ?? "");
  const [maxMarks, setMaxMarks] = useState("100");
  const [passingMark, setPassingMark] = useState("");
  const [examDate, setExamDate] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  // Collapsed by default — with several exams on the page, an "Add a new
  // subject" form permanently expanded under every single one turns simple
  // browsing into a wall of dropdowns. Opening it is a deliberate action per
  // exam, not the default view.
  const [showAddSubjectForm, setShowAddSubjectForm] = useState(false);
  const { show } = useToast();

  async function onAddSubject(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    const invalid = marksConfigError(maxMarks, passingMark);
    if (invalid) {
      setFormError(invalid);
      return;
    }
    try {
      const examSubject = await api.createExamSubject(accessToken, schoolId, exam.id, {
        classId,
        subjectId,
        maxMarks: Number(maxMarks),
        passingMark: passingMark.trim() ? Number(passingMark) : undefined,
        examDate: examDate || undefined,
      });
      setExams((prev) => prev.map((ex) => (ex.id === exam.id ? { ...ex, examSubjects: [...ex.examSubjects, examSubject] } : ex)));
      setExamDate("");
      setShowAddSubjectForm(false);
      show("Subject scheduled for this exam.");
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Failed to add subject");
    }
  }

  // Keyed by examSubjectId, holds only the dates the admin has actually
  // touched in this form — everything else keeps reading straight from
  // exam.examSubjects, so a subject added later (via the form below) or
  // updated elsewhere never needs this map to "catch up".
  const [pendingDates, setPendingDates] = useState<Record<string, string>>({});
  const [savingDates, setSavingDates] = useState(false);
  const [saveDatesError, setSaveDatesError] = useState<string | null>(null);

  function dateValueFor(es: Exam["examSubjects"][number]): string {
    return pendingDates[es.id] ?? (es.examDate ? es.examDate.slice(0, 10) : "");
  }

  const changedSubjectIds = exam.examSubjects
    .filter((es) => es.id in pendingDates && pendingDates[es.id] !== (es.examDate ? es.examDate.slice(0, 10) : ""))
    .map((es) => es.id);

  async function saveDates() {
    setSavingDates(true);
    setSaveDatesError(null);
    try {
      const updates = await Promise.all(
        changedSubjectIds.map((id) =>
          api.updateExamSubject(accessToken, schoolId, exam.id, id, { examDate: pendingDates[id] || undefined }),
        ),
      );
      setExams((prev) =>
        prev.map((ex) =>
          ex.id === exam.id
            ? { ...ex, examSubjects: ex.examSubjects.map((es) => updates.find((u) => u.id === es.id) ?? es) }
            : ex,
        ),
      );
      setPendingDates({});
      show(`${updates.length} exam date${updates.length === 1 ? "" : "s"} updated.`);
    } catch (err) {
      setSaveDatesError(err instanceof ApiError ? err.message : "Failed to save exam dates");
    } finally {
      setSavingDates(false);
    }
  }

  return (
    <div className="space-y-3">
      <Card padding="none">
        <CardHeader
          title={
            <>{exam.name}</>
          }
          description="Subjects already scheduled for this exam."
          actions={
            <ExamTermControl
              schoolId={schoolId}
              accessToken={accessToken}
              exam={exam}
              years={years}
              canManage={canManage}
              onChanged={(term) =>
                setExams((prev) => prev.map((ex) => (ex.id === exam.id ? { ...ex, termId: term.id, term } : ex)))
              }
            />
          }
        />
        <div className="space-y-2 p-5">
          {exam.examSubjects.map((es) => (
            <div key={es.id} className="flex flex-wrap items-center gap-2">
              <Badge tone="accent">
                {es.class.name} · {es.subject.name} · /{es.maxMarks}
              </Badge>
              {es.passingMark !== null && <span className="text-xs text-foreground-muted">Pass {es.passingMark}</span>}
              {canManage && (
                <ExamSubjectMarksEditor
                  schoolId={schoolId}
                  accessToken={accessToken}
                  examId={exam.id}
                  examSubject={es}
                  onUpdated={(updated) =>
                    setExams((prev) =>
                      prev.map((ex) =>
                        ex.id === exam.id
                          ? { ...ex, examSubjects: ex.examSubjects.map((row) => (row.id === updated.id ? updated : row)) }
                          : ex,
                      ),
                    )
                  }
                />
              )}
              {canManage ? (
                <Input
                  type="date"
                  value={dateValueFor(es)}
                  onChange={(e) => setPendingDates((prev) => ({ ...prev, [es.id]: e.target.value }))}
                  className="h-8 w-auto py-1 text-sm"
                  aria-label={`Exam date for ${es.subject.name}`}
                />
              ) : (
                <span className="text-sm text-foreground-muted">{es.examDate ? new Date(es.examDate).toLocaleDateString() : "No date set"}</span>
              )}
            </div>
          ))}
          {exam.examSubjects.length === 0 && <span className="text-sm text-foreground-muted">No subjects scheduled yet.</span>}

          {canManage && exam.examSubjects.length > 0 && (
            <div className="flex flex-wrap items-center gap-3 border-t border-border pt-3">
              <Button type="button" size="sm" loading={savingDates} disabled={changedSubjectIds.length === 0} onClick={saveDates}>
                {changedSubjectIds.length > 0 ? `Save ${changedSubjectIds.length} date${changedSubjectIds.length === 1 ? "" : "s"}` : "Save dates"}
              </Button>
              {saveDatesError && <p className="text-sm text-danger">{saveDatesError}</p>}
            </div>
          )}
        </div>
      </Card>

      {canManage && classes.length > 0 && subjects.length > 0 && (
        <>
          {!showAddSubjectForm ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              icon={<Plus className="size-3.5" />}
              onClick={() => setShowAddSubjectForm(true)}
            >
              Add Subject
            </Button>
          ) : (
            <Card padding="none">
              <CardHeader
                title="Add a new subject"
                description="Schedule another class/subject for this same exam."
                actions={
                  <Button type="button" size="sm" variant="ghost" onClick={() => setShowAddSubjectForm(false)}>
                    Cancel
                  </Button>
                }
              />
              <form onSubmit={onAddSubject} className="flex flex-wrap items-end gap-2 p-5">
                <Select value={classId} onChange={(e) => setClassId(e.target.value)} className="w-auto">
                  {classes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
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
                <Input type="number" min={1} step={1} value={maxMarks} onChange={(e) => setMaxMarks(e.target.value)} placeholder="Max marks" className="w-28" aria-label="Maximum marks" />
                <Input type="number" min={0} step={1} value={passingMark} onChange={(e) => setPassingMark(e.target.value)} placeholder="Pass mark" className="w-28" aria-label="Pass mark" />
                <Input type="date" value={examDate} onChange={(e) => setExamDate(e.target.value)} className="w-auto" aria-label="Exam date" />
                <Button type="submit" size="sm" variant="outline">
                  Add subject
                </Button>
                {formError && <p className="w-full text-sm text-danger">{formError}</p>}
              </form>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
