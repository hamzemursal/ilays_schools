"use client";

import { use, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth, ApiError } from "@/lib/auth-context";
import { api, type AttendanceRow, type AttendanceSession, type AttendanceSessionStatus, type AttendanceStatus } from "@/lib/api";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { Avatar } from "@/components/ui/Avatar";
import { Alert } from "@/components/ui/Alert";
import { EmptyState } from "@/components/ui/EmptyState";
import { SkeletonTable } from "@/components/ui/Skeleton";
import { FormField, Input } from "@/components/ui/FormControls";
import { useToast } from "@/components/ui/Toast";
import { CheckCircle2, CheckCheck, Circle, ClipboardCheck, FileClock, Moon, Save, Sun } from "lucide-react";
import { UnsavedAttendanceDialog } from "@/features/attendance/UnsavedAttendanceDialog";

// Attendance can't be taken for a day that hasn't happened yet — this caps
// the date picker itself, backed up by the same check server-side
// (AttendanceService.assertNotFutureDate) since a picker's max is UX only.
const TODAY = new Date().toISOString().slice(0, 10);

const STATUSES: { value: AttendanceStatus; label: string; on: string; dot: string }[] = [
  { value: "PRESENT", label: "Present", on: "bg-success text-white", dot: "bg-success" },
  { value: "ABSENT", label: "Absent", on: "bg-danger text-white", dot: "bg-danger" },
  { value: "LATE", label: "Late", on: "bg-warning text-white", dot: "bg-warning" },
  { value: "EXCUSED", label: "Excused", on: "bg-violet-600 text-white", dot: "bg-violet-600" },
];

// Labels only, never a clock time — this school-erp instance has no
// per-school schedule/timetable model, so a school running roughly 7am-12pm
// and one running roughly 1pm-5pm both just pick whichever of these two
// they're marking. See AttendanceSession in schema.prisma for the reasoning.
const SESSIONS: { value: AttendanceSession; label: string }[] = [
  { value: "MORNING", label: "Morning Session" },
  { value: "AFTERNOON", label: "Afternoon Session" },
];
const SESSION_LABEL: Record<AttendanceSession, string> = { MORNING: "Morning Session", AFTERNOON: "Afternoon Session" };

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
  const initialSession = searchParams.get("session");
  const [session, setSession] = useState<AttendanceSession>(initialSession === "AFTERNOON" ? "AFTERNOON" : "MORNING");
  const [sessionStatus, setSessionStatus] = useState<AttendanceSessionStatus | null>(null);
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
      .getAttendance(accessToken, schoolId, sectionId, date, session)
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
  }, [accessToken, schoolId, sectionId, date, session]);

  // Independent of whichever session is currently selected above — this is
  // what powers the "Morning Session ✓ Recorded / Afternoon Session ○ Not
  // Recorded" banner, so it always reflects both sessions regardless of
  // which one the teacher happens to be looking at right now. Reloaded
  // after every successful save so the banner flips the moment a session
  // is actually finalized.
  const [statusRefreshKey, setStatusRefreshKey] = useState(0);
  useEffect(() => {
    if (!accessToken) return;
    api
      .getAttendanceSessionStatus(accessToken, schoolId, sectionId, date)
      .then(setSessionStatus)
      .catch(() => setSessionStatus(null));
  }, [accessToken, schoolId, sectionId, date, statusRefreshKey]);

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
      const updated = await api.saveAttendanceDraft(accessToken, schoolId, sectionId, date, session, entries);
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
      const updated = await api.markAttendance(accessToken, schoolId, sectionId, date, session, entries);
      setRows(updated);
      setBaseline(pending);
      setHasDraft(false);
      setLastAction("finalized");
      setStatusRefreshKey((k) => k + 1);
      show("Attendance saved.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to save attendance");
    } finally {
      setSaving(false);
    }
  }

  const title = className && sectionName ? `${className} — Section ${sectionName}` : "Mark attendance";

  const counts = STATUSES.map((st) => ({ ...st, count: rows?.filter((r) => pending[r.enrollmentId] === st.value).length ?? 0 }));
  const savedCount = rows?.filter((r) => r.status !== null && !r.isDraft).length ?? 0;
  const canViewProfile = user?.permissions.includes("students.view") ?? false;

  return (
    <div>
      <PageHeader
        variant="plain"
        eyebrow="Attendance"
        title={title}
        description={[yearName, subjectName].filter(Boolean).join(" · ") || undefined}
        breadcrumbs={[{ label: backLabel, href: backHref }, { label: "Attendance" }]}
      />

      <div className="mx-auto max-w-5xl space-y-4 px-3 pb-4 pt-4 sm:px-5">
        <section className="rounded-2xl border border-border bg-background p-4 shadow-sm sm:p-5">
          <div className="grid gap-4 md:grid-cols-[minmax(0,14rem)_minmax(0,1fr)] md:items-end">
            <FormField label="Date" htmlFor="date">
              <Input
                id="date"
                type="date"
                value={date}
                max={TODAY}
                className="h-11"
                onChange={(e) => {
                  const newDate = e.target.value;
                  attemptAction(() => setDate(newDate));
                }}
              />
            </FormField>
            <div>
              <h2 className="mb-1.5 text-sm font-medium text-foreground">
                Attendance Status — {new Date(date).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" })}
              </h2>
              <div role="radiogroup" aria-label="Attendance Session" className="grid grid-cols-2 gap-2 rounded-xl bg-surface p-1">
                {SESSIONS.map((s) => {
                  const active = session === s.value;
                  const recorded = sessionStatus?.[s.value] ?? false;
                  const Icon = s.value === "MORNING" ? Sun : Moon;
                  return (
                    <button
                      key={s.value}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      aria-label={s.label}
                      onClick={() => {
                        if (!active) attemptAction(() => setSession(s.value));
                      }}
                      className={`flex min-h-12 items-center gap-2.5 rounded-lg px-3 py-2 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                        active ? "bg-accent text-white shadow-sm" : "text-foreground-soft hover:bg-background"
                      }`}
                    >
                      <Icon className="size-4 shrink-0" />
                      <div className="min-w-0">
                        <span className="block text-sm font-semibold">{s.label}</span>
                        {recorded ? (
                          <span className={`inline-flex items-center gap-1 text-xs ${active ? "text-white/90" : "text-success"}`}>
                            <CheckCircle2 className="size-3" /> Recorded
                          </span>
                        ) : (
                          <span className={`inline-flex items-center gap-1 text-xs ${active ? "text-white/80" : "text-foreground-muted"}`}>
                            <Circle className="size-3" /> Not Recorded
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </section>

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
          <>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              <div className="col-span-2 flex items-center justify-between gap-2 rounded-xl border border-border bg-background px-3.5 py-2.5 shadow-sm sm:col-span-1 sm:block">
                <p className="text-xs font-medium text-foreground-muted">Recorded</p>
                <p className="text-lg font-semibold tabular-nums text-foreground">
                  {savedCount} <span className="text-sm font-normal text-foreground-muted">/ {rows.length}</span>
                </p>
              </div>
              {counts.map((c) => (
                <div key={c.value} className="flex items-center justify-between gap-2 rounded-xl border border-border bg-background px-3.5 py-2.5 shadow-sm sm:block">
                  <p className="flex items-center gap-1.5 text-xs font-medium text-foreground-muted">
                    <span className={`size-2 rounded-full ${c.dot}`} aria-hidden /> {c.label}
                  </p>
                  <p className="text-lg font-semibold tabular-nums text-foreground">{c.count}</p>
                </div>
              ))}
            </div>

            <section className="rounded-2xl border border-border bg-background shadow-sm" aria-label="Students">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3 sm:px-5">
                <p className="text-sm font-semibold text-foreground">
                  {rows.length} student(s) · {SESSION_LABEL[session]}
                </p>
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
              <div className="hidden grid-cols-[3rem_minmax(0,1fr)_auto] gap-4 bg-surface-soft px-5 py-2 text-xs font-semibold uppercase tracking-wide text-foreground-muted md:grid">
                <span>#</span>
                <span>Student</span>
                <span>Attendance status</span>
              </div>
              <ul className="space-y-2 p-2 md:space-y-0 md:divide-y md:divide-border md:p-0">
                {rows.map((r) => {
                  const current = pending[r.enrollmentId];
                  const studentIdentity = (
                    <>
                      <Avatar name={`${r.firstName} ${r.lastName}`} photoUrl={r.photoUrl} size="md" />
                      <p className="min-w-0 truncate font-medium text-foreground">
                        {r.firstName} {r.lastName}
                      </p>
                    </>
                  );
                  return (
                    <li
                      key={r.enrollmentId}
                      className="grid gap-3 rounded-xl border border-border p-3 md:grid-cols-[3rem_minmax(0,1fr)_auto] md:items-center md:gap-4 md:rounded-none md:border-0 md:px-5 md:py-3"
                    >
                      <span className="hidden text-sm font-semibold tabular-nums text-foreground-muted md:block">#{r.rollNumber}</span>
                      <div className="flex min-w-0 items-center gap-3">
                        <span className="text-sm font-semibold tabular-nums text-foreground-muted md:hidden">#{r.rollNumber}</span>
                        {canViewProfile ? (
                          <Link
                            href={`/schools/${schoolId}/students/${r.studentId}`}
                            className="flex min-w-0 items-center gap-3 rounded-lg hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                          >
                            {studentIdentity}
                          </Link>
                        ) : (
                          <div className="flex min-w-0 items-center gap-3">{studentIdentity}</div>
                        )}
                      </div>
                      <div
                        className="grid grid-cols-2 gap-2 sm:grid-cols-4 md:flex md:gap-1.5"
                        role="group"
                        aria-label={`Status for ${r.firstName} ${r.lastName}`}
                      >
                        {STATUSES.map((st) => {
                          const isOn = current === st.value;
                          return (
                            <button
                              key={st.value}
                              type="button"
                              aria-pressed={isOn}
                              onClick={() => setPending((prev) => ({ ...prev, [r.enrollmentId]: st.value }))}
                              className={`min-h-11 rounded-lg border px-3 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 md:min-h-9 md:min-w-[4.75rem] ${
                                isOn
                                  ? st.on + " border-transparent shadow-sm"
                                  : "border-border bg-background text-foreground-soft hover:border-accent hover:text-foreground"
                              }`}
                            >
                              {st.label}
                            </button>
                          );
                        })}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>

            <div className="sticky bottom-0 z-10 -mx-3 border-t border-border bg-background/95 px-3 py-3 backdrop-blur sm:bottom-3 sm:mx-0 sm:rounded-2xl sm:border sm:px-4 sm:shadow-lg">
              <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                <Button icon={<CheckCircle2 className="size-4" />} loading={saving} onClick={save} className="flex-1 sm:flex-none">
                  Save attendance
                </Button>
                <Button
                  variant="outline"
                  icon={<Save className="size-4" />}
                  loading={savingDraft}
                  disabled={saving}
                  onClick={() => saveDraft(false)}
                  className="flex-1 sm:flex-none"
                >
                  Save as draft
                </Button>
                {!isDirty && lastAction === "finalized" && (
                  <span className="w-full text-sm text-success sm:w-auto">
                    Saved — {rows.length} student(s) recorded for {new Date(date).toLocaleDateString()} ({SESSION_LABEL[session]}).
                  </span>
                )}
                {!isDirty && lastAction === "draft" && (
                  <span className="inline-flex w-full items-center gap-1.5 text-sm text-warning sm:w-auto">
                    <FileClock className="size-4" /> Saved as draft — not final yet.
                  </span>
                )}
                {isDirty && <span className="w-full text-xs text-foreground-muted sm:ml-auto sm:w-auto">Unsaved changes</span>}
              </div>
            </div>
          </>
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
