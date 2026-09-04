"use client";

import { use, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth, ApiError } from "@/lib/auth-context";
import { api, type AttendanceRow, type AttendanceStatus } from "@/lib/api";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Avatar } from "@/components/ui/Avatar";
import { Alert } from "@/components/ui/Alert";
import { EmptyState } from "@/components/ui/EmptyState";
import { SkeletonTable } from "@/components/ui/Skeleton";
import { FormField, Input } from "@/components/ui/FormControls";
import { useToast } from "@/components/ui/Toast";
import { CheckCircle2, CheckCheck, ClipboardCheck, FileClock, Save } from "lucide-react";
import { UnsavedAttendanceDialog } from "@/features/attendance/UnsavedAttendanceDialog";

const STATUSES: { value: AttendanceStatus; label: string; on: string }[] = [
  { value: "PRESENT", label: "Present", on: "bg-success text-white" },
  { value: "ABSENT", label: "Absent", on: "bg-danger text-white" },
  { value: "LATE", label: "Late", on: "bg-warning text-white" },
  { value: "EXCUSED", label: "Excused", on: "bg-accent text-white" },
];

export default function AttendancePage({ params }: { params: Promise<{ id: string; sectionId: string }> }) {
  const { id: schoolId, sectionId } = use(params);
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, accessToken } = useAuth();
  const { show } = useToast();

  // Purely for display — attendance itself is recorded per section per
  // day, not per subject, so these only appear when a caller (e.g. an
  // assignment's "Mark attendance" link) supplies them as context.
  const yearName = searchParams.get("year");
  const className = searchParams.get("class");
  const sectionName = searchParams.get("section");
  const subjectName = searchParams.get("subject");
  const backHref = searchParams.get("backHref") ?? "/my-classes";
  const backLabel = searchParams.get("backLabel") ?? "My classes";

  const [date, setDate] = useState(searchParams.get("date") ?? new Date().toISOString().slice(0, 10));
  const [rows, setRows] = useState<AttendanceRow[] | null>(null);
  const [pending, setPending] = useState<Record<string, AttendanceStatus>>({});
  // The last loaded-or-saved snapshot — comparing `pending` against this
  // (rather than a boolean flipped on every click) is what lets a teacher
  // click the same status twice without it reading as "unsaved changes".
  const [baseline, setBaseline] = useState<Record<string, AttendanceStatus>>({});
  const [hasDraft, setHasDraft] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [lastAction, setLastAction] = useState<"finalized" | "draft" | null>(null);

  const [leaveDialogOpen, setLeaveDialogOpen] = useState(false);
  const pendingActionRef = useRef<(() => void) | null>(null);

  const isDirty = rows !== null && rows.some((r) => pending[r.enrollmentId] !== baseline[r.enrollmentId]);

  useEffect(() => {
    if (!accessToken) return;
    api
      .getAttendance(accessToken, schoolId, sectionId, date)
      .then((data) => {
        setRows(data);
        // No record yet for a student today defaults to Present, so a
        // typical "everyone showed up" day is a single click to save;
        // the teacher only needs to touch the exceptions.
        const initial = Object.fromEntries(data.map((r) => [r.enrollmentId, r.status ?? "PRESENT"]));
        setPending(initial);
        setBaseline(initial);
        setHasDraft(data.some((r) => r.isDraft));
        setLastAction(null);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load attendance"));
  }, [accessToken, schoolId, sectionId, date]);

  // The native "leave site?" prompt — the only guard that can catch closing
  // the tab, refreshing, or typing a new URL. Its wording is entirely
  // browser-controlled (no Cancel/Discard/Draft choice here); the in-app
  // dialog below is what actually offers those.
  useEffect(() => {
    function handler(e: BeforeUnloadEvent) {
      if (!isDirty) return;
      e.preventDefault();
      e.returnValue = "";
    }
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);

  // Catches in-app navigation — sidebar links, the topbar, this page's own
  // breadcrumb — by intercepting anchor clicks while there are unsaved
  // marks, without needing any changes to those components. It cannot
  // catch the browser's own Back/Forward buttons; that's a known gap
  // shared by most single-page apps, not something fixable from here.
  useEffect(() => {
    if (!isDirty) return;
    function handleClick(e: MouseEvent) {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const anchor = (e.target as HTMLElement)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!anchor) return;
      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      if (url.pathname + url.search === window.location.pathname + window.location.search) return;

      e.preventDefault();
      e.stopPropagation();
      const href = url.pathname + url.search + url.hash;
      pendingActionRef.current = () => router.push(href);
      setLeaveDialogOpen(true);
    }
    document.addEventListener("click", handleClick, true);
    return () => document.removeEventListener("click", handleClick, true);
  }, [isDirty, router]);

  // Runs `action` immediately when there's nothing unsaved; otherwise holds
  // it and opens the three-way dialog. Used for both real navigation and
  // the in-page "change date" control, which is just as much a "leave the
  // current unsaved day" as clicking away is.
  function attemptAction(action: () => void) {
    if (isDirty) {
      pendingActionRef.current = action;
      setLeaveDialogOpen(true);
    } else {
      action();
    }
  }

  function closeLeaveDialog() {
    setLeaveDialogOpen(false);
    pendingActionRef.current = null;
  }

  function discardAndLeave() {
    const action = pendingActionRef.current;
    setLeaveDialogOpen(false);
    pendingActionRef.current = null;
    action?.();
  }

  async function saveDraft(thenRunPendingAction: boolean) {
    if (!accessToken || !rows) return;
    setSavingDraft(true);
    setError(null);
    try {
      const entries = Object.entries(pending).map(([enrollmentId, status]) => ({ enrollmentId, status }));
      const updated = await api.saveAttendanceDraft(accessToken, schoolId, sectionId, date, entries);
      setRows(updated);
      setBaseline(pending);
      setHasDraft(true);
      setLastAction("draft");
      show("Saved as draft.");
      if (thenRunPendingAction) {
        const action = pendingActionRef.current;
        setLeaveDialogOpen(false);
        pendingActionRef.current = null;
        action?.();
      }
    } catch (err) {
      show(err instanceof ApiError ? err.message : "Failed to save draft", "danger");
    } finally {
      setSavingDraft(false);
    }
  }

  async function save() {
    if (!accessToken || !rows) return;
    setSaving(true);
    setError(null);
    try {
      const entries = Object.entries(pending).map(([enrollmentId, status]) => ({ enrollmentId, status }));
      const updated = await api.markAttendance(accessToken, schoolId, sectionId, date, entries);
      setRows(updated);
      setBaseline(pending);
      setHasDraft(false);
      setLastAction("finalized");
      show("Attendance saved.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to save attendance");
    } finally {
      setSaving(false);
    }
  }

  const title =
    className && sectionName ? `${className} · ${sectionName}${subjectName ? ` — ${subjectName}` : ""}` : "Mark attendance";

  return (
    <div>
      <PageHeader
        eyebrow="Attendance"
        title={title}
        description={yearName ?? undefined}
        breadcrumbs={[{ label: backLabel, href: backHref }, { label: "Attendance" }]}
      />

      <div className="mx-auto max-w-2xl space-y-5 p-4 sm:p-6">
        <Card>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <FormField label="Date" htmlFor="date" className="max-w-xs">
              <Input
                id="date"
                type="date"
                value={date}
                onChange={(e) => {
                  const newDate = e.target.value;
                  attemptAction(() => setDate(newDate));
                }}
              />
            </FormField>
            {(className || subjectName) && (
              <div className="flex flex-wrap gap-1.5">
                {className && <Badge tone="accent">{className}{sectionName ? ` · ${sectionName}` : ""}</Badge>}
                {subjectName && <Badge tone="accent">{subjectName}</Badge>}
                {yearName && <Badge tone="neutral">{yearName}</Badge>}
              </div>
            )}
          </div>
        </Card>

        {error && <Alert tone="danger">{error}</Alert>}

        {hasDraft && !isDirty && (
          <Alert tone="warning">
            This day was left as a draft — continue marking below, then save it as final attendance.
          </Alert>
        )}

        {!rows ? (
          <SkeletonTable rows={5} cols={2} />
        ) : rows.length === 0 ? (
          <EmptyState icon={ClipboardCheck} title="No active students" description="This section has no active students to mark." />
        ) : (
          <div className="space-y-2">
            <div className="flex justify-end">
              <Button
                type="button"
                size="sm"
                variant="outline"
                icon={<CheckCheck className="size-4" />}
                onClick={() => setPending(Object.fromEntries(rows.map((r) => [r.enrollmentId, "PRESENT" as AttendanceStatus])))}
              >
                Mark all Present
              </Button>
            </div>
            {rows.map((r) => {
              const canViewProfile = user?.permissions.includes("students.view") ?? false;
              const studentIdentity = (
                <>
                  <Avatar name={`${r.firstName} ${r.lastName}`} photoUrl={r.photoUrl} size="md" />
                  <p className="font-medium text-foreground">
                    <span className="text-foreground-muted">#{r.rollNumber}</span> {r.firstName} {r.lastName}
                  </p>
                </>
              );
              return (
              <Card key={r.enrollmentId} padding="sm">
                <div className="flex flex-col gap-2 p-2 sm:flex-row sm:items-center sm:justify-between">
                  {canViewProfile ? (
                    <Link href={`/schools/${schoolId}/students/${r.studentId}`} className="flex items-center gap-3 hover:opacity-80">
                      {studentIdentity}
                    </Link>
                  ) : (
                    <div className="flex items-center gap-3">{studentIdentity}</div>
                  )}
                  <div className="grid grid-cols-4 gap-1 sm:flex sm:gap-2">
                    {STATUSES.map((s) => {
                      const isOn = pending[r.enrollmentId] === s.value;
                      return (
                        <button
                          key={s.value}
                          type="button"
                          onClick={() => setPending((prev) => ({ ...prev, [r.enrollmentId]: s.value }))}
                          className={`rounded-lg border px-2 py-2.5 text-xs font-semibold transition-colors sm:px-3 sm:text-sm ${
                            isOn ? s.on + " border-transparent" : "border-border text-foreground-soft hover:border-accent"
                          }`}
                        >
                          {s.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </Card>
              );
            })}
          </div>
        )}

        {rows && rows.length > 0 && (
          <div className="flex flex-wrap items-center gap-3">
            <Button icon={<CheckCircle2 className="size-4" />} loading={saving} onClick={save}>
              Save attendance
            </Button>
            <Button
              variant="outline"
              icon={<Save className="size-4" />}
              loading={savingDraft}
              disabled={saving}
              onClick={() => saveDraft(false)}
            >
              Save as draft
            </Button>
            {!isDirty && lastAction === "finalized" && (
              <span className="text-sm text-success">
                Saved — {rows.length} student(s) recorded for {new Date(date).toLocaleDateString()}.
              </span>
            )}
            {!isDirty && lastAction === "draft" && (
              <span className="inline-flex items-center gap-1.5 text-sm text-warning">
                <FileClock className="size-4" /> Saved as draft — not final yet.
              </span>
            )}
          </div>
        )}
      </div>

      <UnsavedAttendanceDialog
        open={leaveDialogOpen}
        savingDraft={savingDraft}
        onKeepEditing={closeLeaveDialog}
        onDiscard={discardAndLeave}
        onSaveDraftAndLeave={() => saveDraft(true)}
      />
    </div>
  );
}
