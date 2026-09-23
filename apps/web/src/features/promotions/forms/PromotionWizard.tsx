"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, ArrowUpCircle, CheckCircle2, RotateCcw, Users, Eye } from "lucide-react";
import { ApiError, useAuth } from "@/lib/auth-context";
import {
  api,
  type AcademicYear,
  type ClassWithSections,
  type PromotionAssignment,
  type PromotionOutcome,
  type PromotionPreview,
  type PromotionSectionOption,
  type PromotionStudentRow,
} from "@/lib/api";
import { Card, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { FormField, Select } from "@/components/ui/FormControls";
import { Badge } from "@/components/ui/Badge";
import { StatCard } from "@/components/ui/StatCard";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { DataTable, type Column } from "@/components/ui/DataTable";

type Decision = PromotionOutcome | "MANUAL_REVIEW" | "";

const NATURAL_OUTCOME_LABEL: Record<PromotionPreview["naturalOutcome"], string> = {
  PROMOTED: "Promote",
  COMPLETED: "Complete this division",
  GRADUATED: "Graduate",
};

function formatPercent(value: number | null): string {
  return value === null ? "—" : `${value.toFixed(2)}%`;
}

function EligibilityBadge({ eligible }: { eligible: boolean | null }) {
  if (eligible === null) return <Badge tone="warning">Incomplete</Badge>;
  return eligible ? <Badge tone="success">Eligible</Badge> : <Badge tone="danger">Not Eligible</Badge>;
}

function needsDestination(outcome: PromotionOutcome | ""): boolean {
  return outcome === "PROMOTED" || outcome === "RETAINED";
}

// Auto-fills a starting destination for every student already assigned an
// outcome, respecting real capacity — never a blank pick left for the
// Admin to fill in for a normal Promote/Retain decision. Unchanged
// algorithm from before this redesign, just reused under the new UI.
function autoFillDestinations(
  students: PromotionStudentRow[],
  outcomeFor: Map<string, Decision>,
  sections: { PROMOTED_OR_NATURAL: PromotionSectionOption[]; RETAINED: PromotionSectionOption[] },
): Map<string, string> {
  const consumed = new Map<string, number>();
  const result = new Map<string, string>();
  for (const student of students) {
    const outcome = outcomeFor.get(student.enrollmentId);
    if (outcome !== "PROMOTED" && outcome !== "RETAINED") continue;
    const pool = outcome === "PROMOTED" ? sections.PROMOTED_OR_NATURAL : sections.RETAINED;
    const target = pool.find((s) => {
      const used = consumed.get(s.id) ?? s.currentActive;
      return s.capacity === null || used < s.capacity;
    });
    if (target) {
      result.set(student.enrollmentId, target.id);
      consumed.set(target.id, Math.max(consumed.get(target.id) ?? target.currentActive, target.currentActive) + 1);
    }
  }
  return result;
}

export function PromotionWizard({ schoolId }: { schoolId: string }) {
  const { accessToken } = useAuth();

  const [years, setYears] = useState<AcademicYear[]>([]);
  const [classes, setClasses] = useState<ClassWithSections[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [classId, setClassId] = useState("");
  const [sectionId, setSectionId] = useState("");
  const [fromYearId, setFromYearId] = useState("");
  const [toYearId, setToYearId] = useState("");

  const [preview, setPreview] = useState<PromotionPreview | null>(null);
  // Every enrollmentId in preview.students has an entry here once loaded —
  // "" means the Admin hasn't decided yet (including every Incomplete
  // student, who starts here since suggestedOutcome is null for them).
  const [decisions, setDecisions] = useState<Map<string, Decision>>(new Map());
  // Only meaningful while decisions[id] === "MANUAL_REVIEW" — the real
  // outcome (still just the section's natural one, or RETAINED — the
  // backend allows nothing else) the Admin picks for that one exception.
  const [manualOutcomes, setManualOutcomes] = useState<Map<string, PromotionOutcome | "">>(new Map());
  const [destinations, setDestinations] = useState<Map<string, string>>(new Map());

  const [previewing, setPreviewing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // A distinct message from a generic error — the backend's own wording for
  // "the destination class doesn't exist yet", surfaced as an actionable
  // state instead of a plain red banner. Never fabricated: this is always
  // the API's real message text.
  const [destinationNotReadyMessage, setDestinationNotReadyMessage] = useState<string | null>(null);
  const [confirmedCount, setConfirmedCount] = useState<number | null>(null);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);

  useEffect(() => {
    if (!accessToken) return;
    Promise.all([api.listAcademicYears(accessToken, schoolId), api.listClasses(accessToken, schoolId)])
      .then(([y, c]) => {
        setYears(y);
        setClasses(c);
        const current = y.find((yr) => yr.isCurrent) ?? y[0];
        if (current) setFromYearId(current.id);
        if (c[0]) {
          setClassId(c[0].id);
          setSectionId(c[0].sections[0]?.id ?? "");
        }
      })
      .catch((err) => setLoadError(err instanceof ApiError ? err.message : "Failed to load form data"));
  }, [accessToken, schoolId]);

  const selectedClass = classes.find((c) => c.id === classId);

  // Promotion only ever moves students INTO an academic year the Admin has
  // already created, and only a later one than the year being promoted from.
  const fromYear = years.find((y) => y.id === fromYearId);
  const laterYears = fromYear ? years.filter((y) => new Date(y.startDate) > new Date(fromYear.startDate)) : [];

  function resetSource() {
    setPreview(null);
    setDecisions(new Map());
    setManualOutcomes(new Map());
    setDestinations(new Map());
    setError(null);
    setDestinationNotReadyMessage(null);
    setConfirmedCount(null);
  }

  function effectiveOutcome(enrollmentId: string): PromotionOutcome | "" {
    const d = decisions.get(enrollmentId) ?? "";
    if (d === "MANUAL_REVIEW") return manualOutcomes.get(enrollmentId) ?? "";
    return d;
  }

  // Recomputes the system-picked destination for every student on a normal
  // (non-manual) Promote/Retain decision — run after ANY decision changes,
  // since a decision made directly (not via Manual Review) never leaves a
  // destination for the Admin to fill in themselves. Manual-mode rows are
  // left untouched here; the Admin controls those directly.
  function recomputeAutoDestinations(
    currentDecisions: Map<string, Decision>,
    prevDestinations: Map<string, string>,
  ): Map<string, string> {
    if (!preview) return prevDestinations;
    const autoFilled = autoFillDestinations(preview.students, currentDecisions, {
      PROMOTED_OR_NATURAL: preview.nextClassSections,
      RETAINED: preview.currentClassSections,
    });
    const result = new Map(prevDestinations);
    for (const s of preview.students) {
      const d = currentDecisions.get(s.enrollmentId) ?? "";
      if (d === "PROMOTED" || d === "RETAINED") {
        if (autoFilled.has(s.enrollmentId)) result.set(s.enrollmentId, autoFilled.get(s.enrollmentId)!);
        else result.delete(s.enrollmentId);
      } else if (d === "") {
        result.delete(s.enrollmentId);
      }
    }
    return result;
  }

  function setDecisionFor(enrollmentId: string, decision: Decision) {
    const previousDecision = decisions.get(enrollmentId) ?? "";
    const nextDecisions = new Map(decisions).set(enrollmentId, decision);
    setDecisions(nextDecisions);

    if (decision === "MANUAL_REVIEW") {
      // Opening Manual Review reveals the controls for whatever was already
      // decided — it never silently resets a student's outcome. Only when
      // nothing had been decided yet (an Incomplete row) does it fall back
      // to the system's own suggestion.
      if (!manualOutcomes.has(enrollmentId)) {
        const seed =
          previousDecision === "PROMOTED" || previousDecision === "RETAINED"
            ? previousDecision
            : (preview?.students.find((s) => s.enrollmentId === enrollmentId)?.suggestedOutcome ?? "");
        setManualOutcomes((prev) => new Map(prev).set(enrollmentId, seed ?? ""));
      }
    } else if (manualOutcomes.has(enrollmentId)) {
      setManualOutcomes((prev) => {
        const next = new Map(prev);
        next.delete(enrollmentId);
        return next;
      });
    }

    setDestinations((prev) => recomputeAutoDestinations(nextDecisions, prev));
  }

  function setManualOutcomeFor(enrollmentId: string, outcome: PromotionOutcome | "") {
    setManualOutcomes((prev) => new Map(prev).set(enrollmentId, outcome));
    // Switching between the two allowed outcomes inside Manual Review
    // changes which section pool is valid — clear so the Admin makes a
    // fresh, deliberate pick rather than submitting a stale section.
    setDestinations((prev) => {
      const next = new Map(prev);
      next.delete(enrollmentId);
      return next;
    });
  }

  async function onPreview() {
    if (!accessToken || !sectionId || !fromYearId || !toYearId) return;
    setError(null);
    setDestinationNotReadyMessage(null);
    setConfirmedCount(null);
    setPreview(null);
    setPreviewing(true);
    try {
      const result = await api.previewPromotion(accessToken, schoolId, sectionId, fromYearId, toYearId);
      setPreview(result);
      const initialDecisions = new Map<string, Decision>(
        result.students.map((s) => [s.enrollmentId, s.suggestedOutcome ?? ""]),
      );
      setDecisions(initialDecisions);
      setManualOutcomes(new Map());
      setDestinations(
        autoFillDestinations(result.students, initialDecisions, {
          PROMOTED_OR_NATURAL: result.nextClassSections,
          RETAINED: result.currentClassSections,
        }),
      );
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Failed to preview promotion";
      // The backend's own wording for "that class hasn't been created in
      // the destination year yet" always contains this phrase — matched
      // here only to choose the actionable-state UI, never to change what
      // is shown (the real message is always displayed verbatim).
      if (/has not been created for/i.test(message)) setDestinationNotReadyMessage(message);
      else setError(message);
    } finally {
      setPreviewing(false);
    }
  }

  const allDecided = preview
    ? preview.students.every((s) => {
        const outcome = effectiveOutcome(s.enrollmentId);
        if (!outcome) return false;
        return !needsDestination(outcome) || !!destinations.get(s.enrollmentId);
      })
    : false;

  async function onConfirm() {
    if (!accessToken || !preview || !toYearId || !allDecided) return;
    setError(null);
    setConfirming(true);
    try {
      const assignments: PromotionAssignment[] = preview.students.map((s) => {
        const outcome = effectiveOutcome(s.enrollmentId) as PromotionOutcome;
        const targetSectionId = needsDestination(outcome) ? destinations.get(s.enrollmentId) : undefined;
        return { enrollmentId: s.enrollmentId, outcome, targetSectionId };
      });
      const result = await api.confirmPromotion(accessToken, schoolId, sectionId, {
        fromAcademicYearId: fromYearId,
        toAcademicYearId: toYearId,
        assignments,
      });
      setConfirmedCount(result.items.length);
      setPreview(null);
      setShowConfirmDialog(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to confirm promotion");
      setShowConfirmDialog(false);
    } finally {
      setConfirming(false);
    }
  }

  // The real destination class + section name for one student's CURRENT
  // decision — never computed independently of the same pools/ids the
  // confirm request itself will use.
  function destinationLabel(s: PromotionStudentRow): string | null {
    const outcome = effectiveOutcome(s.enrollmentId);
    if (!preview || !needsDestination(outcome)) return null;
    const pool = outcome === preview.naturalOutcome ? preview.nextClassSections : preview.currentClassSections;
    const section = pool.find((sec) => sec.id === destinations.get(s.enrollmentId));
    if (!section) return null;
    const className = outcome === preview.naturalOutcome ? preview.nextClass?.name : preview.currentClass.name;
    return `${className} · ${section.name}`;
  }

  if (loadError) return <Alert tone="danger">{loadError}</Alert>;

  const totalStudents = preview?.students.length ?? 0;
  const promoteCount = preview ? preview.students.filter((s) => effectiveOutcome(s.enrollmentId) === preview.naturalOutcome).length : 0;
  const retainCount = preview ? preview.students.filter((s) => effectiveOutcome(s.enrollmentId) === "RETAINED").length : 0;
  const manualReviewCount = preview ? preview.students.filter((s) => decisions.get(s.enrollmentId) === "MANUAL_REVIEW").length : 0;

  const promotedSectionNames = preview
    ? [
        ...new Set(
          preview.students
            .filter((s) => effectiveOutcome(s.enrollmentId) === preview.naturalOutcome)
            .map((s) => destinations.get(s.enrollmentId))
            .filter((id): id is string => !!id)
            .map((id) => preview.nextClassSections.find((sec) => sec.id === id)?.name)
            .filter((name): name is string => !!name),
        ),
      ]
    : [];
  const retainedSectionNames = preview
    ? [
        ...new Set(
          preview.students
            .filter((s) => effectiveOutcome(s.enrollmentId) === "RETAINED")
            .map((s) => destinations.get(s.enrollmentId))
            .filter((id): id is string => !!id)
            .map((id) => preview.currentClassSections.find((sec) => sec.id === id)?.name)
            .filter((name): name is string => !!name),
        ),
      ]
    : [];

  const columns: Column<PromotionStudentRow>[] = preview
    ? [
        {
          key: "index",
          header: "#",
          render: (s) => <span className="text-foreground-muted">{preview.students.findIndex((x) => x.enrollmentId === s.enrollmentId) + 1}</span>,
        },
        {
          key: "student",
          header: "Student",
          sortValue: (s) => `${s.firstName} ${s.lastName}`,
          render: (s) => (
            <div>
              <p className="font-medium text-foreground">
                {s.firstName} {s.lastName}
              </p>
              <p className="text-xs text-foreground-muted">{s.studentNumber}</p>
            </div>
          ),
        },
        { key: "roll", header: "Roll #", sortValue: (s) => s.rollNumber, render: (s) => <span className="tabular-nums">#{s.rollNumber}</span> },
        { key: "term1", header: "Term 1", sortValue: (s) => s.term1Percentage ?? -1, render: (s) => <span className="tabular-nums">{formatPercent(s.term1Percentage)}</span> },
        { key: "term2", header: "Term 2", sortValue: (s) => s.term2Percentage ?? -1, render: (s) => <span className="tabular-nums">{formatPercent(s.term2Percentage)}</span> },
        {
          key: "annual",
          header: "Annual Result",
          sortValue: (s) => s.annualPercentage ?? -1,
          render: (s) => <span className="font-medium tabular-nums text-foreground">{formatPercent(s.annualPercentage)}</span>,
        },
        { key: "eligibility", header: "Eligibility", render: (s) => <EligibilityBadge eligible={s.eligible} /> },
        {
          key: "decision",
          header: "Decision",
          render: (s) => {
            const decision = decisions.get(s.enrollmentId) ?? "";
            return (
              <Select
                value={decision}
                onChange={(e) => setDecisionFor(s.enrollmentId, e.target.value as Decision)}
                className="w-44"
                aria-label={`Decision for ${s.firstName} ${s.lastName}`}
              >
                <option value="">Review…</option>
                <option value={preview.naturalOutcome} disabled={s.eligible === false}>
                  {NATURAL_OUTCOME_LABEL[preview.naturalOutcome]}
                </option>
                <option value="RETAINED">Retain</option>
                <option value="MANUAL_REVIEW">Manual Review</option>
              </Select>
            );
          },
        },
        {
          key: "destination",
          header: "Destination",
          render: (s) => {
            const decision = decisions.get(s.enrollmentId) ?? "";
            if (decision !== "MANUAL_REVIEW") {
              const label = destinationLabel(s);
              const outcome = effectiveOutcome(s.enrollmentId);
              if (!needsDestination(outcome)) return <span className="text-foreground-muted">—</span>;
              return label ? (
                <Badge tone={outcome === preview.naturalOutcome ? "accent" : "neutral"}>{label}</Badge>
              ) : (
                <span className="text-sm text-danger">No section available</span>
              );
            }

            // Manual Review — the one place per-student destination
            // controls are shown, exactly the "exceptional case" the
            // Admin explicitly opted into for this student.
            const manualOutcome = manualOutcomes.get(s.enrollmentId) ?? "";
            const pool = manualOutcome === preview.naturalOutcome ? preview.nextClassSections : manualOutcome === "RETAINED" ? preview.currentClassSections : [];
            return (
              <div className="flex flex-wrap items-center gap-1.5">
                <Select
                  value={manualOutcome}
                  onChange={(e) => setManualOutcomeFor(s.enrollmentId, e.target.value as PromotionOutcome | "")}
                  className="w-36"
                  aria-label={`Manual outcome for ${s.firstName} ${s.lastName}`}
                >
                  <option value="">Choose…</option>
                  <option value={preview.naturalOutcome} disabled={s.eligible === false}>
                    {NATURAL_OUTCOME_LABEL[preview.naturalOutcome]}
                  </option>
                  <option value="RETAINED">Retain</option>
                </Select>
                {needsDestination(manualOutcome) && (
                  <Select
                    value={destinations.get(s.enrollmentId) ?? ""}
                    onChange={(e) => setDestinations((prev) => new Map(prev).set(s.enrollmentId, e.target.value))}
                    className="w-40"
                    aria-label={`Destination section for ${s.firstName} ${s.lastName}`}
                  >
                    <option value="">Select…</option>
                    {(pool ?? []).map((sec) => (
                      <option key={sec.id} value={sec.id}>
                        {sec.name} — {sec.available === null ? "Unlimited" : `${sec.available} available`}
                      </option>
                    ))}
                  </Select>
                )}
              </div>
            );
          },
        },
      ]
    : [];

  return (
    <div className="space-y-5">
      <Card>
        <div className="flex items-center gap-2">
          <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-semibold text-white">1</span>
          <h2 className="text-sm font-semibold text-foreground">Select Source and Destination</h2>
        </div>

        <div className="mt-4 grid grid-cols-1 items-center gap-3 lg:grid-cols-[1fr_auto_1fr]">
          <div className="rounded-xl border border-border bg-surface-soft p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-foreground-muted">From (Current Year)</p>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <FormField label="From academic year" htmlFor="fromAcademicYearId">
                <Select
                  id="fromAcademicYearId"
                  value={fromYearId}
                  onChange={(e) => {
                    setFromYearId(e.target.value);
                    setToYearId("");
                    resetSource();
                  }}
                >
                  {years.map((y) => (
                    <option key={y.id} value={y.id}>
                      {y.name}
                    </option>
                  ))}
                </Select>
              </FormField>
              <FormField label="Class" htmlFor="sourceClassId">
                <Select
                  id="sourceClassId"
                  value={classId}
                  onChange={(e) => {
                    setClassId(e.target.value);
                    const c = classes.find((cl) => cl.id === e.target.value);
                    setSectionId(c?.sections[0]?.id ?? "");
                    resetSource();
                  }}
                >
                  {classes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </FormField>
              <FormField label="Section" htmlFor="sourceSectionId">
                <Select
                  id="sourceSectionId"
                  value={sectionId}
                  onChange={(e) => {
                    setSectionId(e.target.value);
                    resetSource();
                  }}
                >
                  {selectedClass?.sections.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </Select>
              </FormField>
            </div>
          </div>

          <ArrowRight className="mx-auto hidden size-5 text-foreground-muted lg:block" />

          <div className="rounded-xl border border-accent/30 bg-accent-soft/15 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-accent">To (Destination Year)</p>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <FormField label="To academic year" htmlFor="toAcademicYearId" required>
                <Select
                  id="toAcademicYearId"
                  required
                  value={toYearId}
                  onChange={(e) => {
                    setToYearId(e.target.value);
                    resetSource();
                  }}
                >
                  <option value="">Select…</option>
                  {laterYears.map((y) => (
                    <option key={y.id} value={y.id}>
                      {y.name}
                    </option>
                  ))}
                </Select>
              </FormField>
              <FormField label="Class">
                <p className="flex h-10 items-center text-sm text-foreground-soft">
                  {preview ? (preview.nextClass?.name ?? "—") : "Preview to see"}
                </p>
              </FormField>
              <FormField label="Section">
                <p className="flex h-10 items-center text-sm text-foreground-soft">
                  {preview ? (promotedSectionNames.length > 0 ? promotedSectionNames.join(", ") : "—") : "Preview to see"}
                </p>
              </FormField>
            </div>
          </div>
        </div>

        {fromYear && laterYears.length === 0 && (
          <Alert tone="warning" className="mt-4">
            There is no academic year after {fromYear.name} yet. Create it first (Academic → Years) and prepare its
            classes and sections — Promotion never creates an academic year for you.
          </Alert>
        )}

        <Button
          className="mt-4"
          icon={<ArrowUpCircle className="size-4" />}
          loading={previewing}
          disabled={!classId || !sectionId || !fromYearId || !toYearId}
          onClick={onPreview}
        >
          Preview
        </Button>
      </Card>

      {error && <Alert tone="danger">{error}</Alert>}

      {destinationNotReadyMessage && (
        <Card>
          <div className="flex items-start gap-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-warning-soft text-warning">
              <ArrowUpCircle className="size-4.5" />
            </div>
            <div className="min-w-0">
              <h3 className="font-semibold text-foreground">Destination not ready</h3>
              <p className="mt-1 text-sm text-foreground-soft">{destinationNotReadyMessage}</p>
              <Link href={`/schools/${schoolId}/academic/years/${toYearId}`} className="mt-3 inline-block">
                <Button size="sm" variant="outline" icon={<ArrowRight className="size-4" />}>
                  Go to {laterYears.find((y) => y.id === toYearId)?.name ?? "that academic year"}
                </Button>
              </Link>
            </div>
          </div>
        </Card>
      )}

      {confirmedCount !== null && (
        <Alert tone="success">
          Promotion confirmed — {confirmedCount} student{confirmedCount === 1 ? "" : "s"} updated.
        </Alert>
      )}

      {preview && (
        <>
          {preview.warnings && preview.warnings.length > 0 && (
            <Alert tone="warning">
              {preview.warnings.map((w) => (
                <p key={w}>{w}</p>
              ))}
            </Alert>
          )}

          <Card padding="none">
            <CardHeader
              title={
                <span className="flex items-center gap-2">
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-semibold text-white">
                    2
                  </span>
                  Preview Students
                </span>
              }
              description="Review each student's results and promotion decision. You can override any decision with Manual Review."
            />
            <div className="p-5">
              <DataTable
                data={preview.students}
                columns={columns}
                rowKey={(s) => s.enrollmentId}
                searchPlaceholder="Search by name, student number or roll number…"
                searchFilter={(s, q) =>
                  `${s.firstName} ${s.lastName}`.toLowerCase().includes(q) ||
                  s.studentNumber.toLowerCase().includes(q) ||
                  String(s.rollNumber).includes(q)
                }
                emptyTitle="No active students"
                emptyDescription="Nothing to promote in this section for that year."
                searchEmptyTitle="No students match"
                pagination={{ pageSizeOptions: [10, 25, 50], defaultPageSize: 25, itemLabel: "students" }}
              />
            </div>
          </Card>

          {preview.students.length > 0 && (
            <>
              <Card>
                <div className="flex items-center gap-2">
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-semibold text-white">
                    3
                  </span>
                  <h2 className="text-sm font-semibold text-foreground">Promotion Summary</h2>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <StatCard icon={Users} label="Total Students" value={totalStudents} />
                  <StatCard icon={CheckCircle2} label="Will be Promoted" value={promoteCount} tone="success" hint={`${totalStudents ? Math.round((promoteCount / totalStudents) * 100) : 0}%`} />
                  <StatCard icon={RotateCcw} label="Will be Retained" value={retainCount} tone="warning" hint={`${totalStudents ? Math.round((retainCount / totalStudents) * 100) : 0}%`} />
                  <StatCard icon={Eye} label="Manual Review" value={manualReviewCount} tone="neutral" />
                </div>

                <div className="mt-4 rounded-lg bg-surface-soft p-4 text-sm text-foreground-soft">
                  <p className="font-medium text-foreground">What will happen?</p>
                  <ul className="mt-2 list-inside list-disc space-y-1">
                    {promoteCount > 0 && (
                      <li>
                        {promoteCount} student{promoteCount === 1 ? "" : "s"} will receive new enrollments in{" "}
                        <span className="font-medium text-foreground">
                          {preview.nextClass?.name}
                          {promotedSectionNames.length > 0 ? ` · ${promotedSectionNames.join("/")}` : ""}
                        </span>{" "}
                        for {preview.targetAcademicYear?.name}.
                      </li>
                    )}
                    {retainCount > 0 && (
                      <li>
                        {retainCount} student{retainCount === 1 ? "" : "s"} will receive new enrollments in{" "}
                        <span className="font-medium text-foreground">
                          {preview.currentClass.name}
                          {retainedSectionNames.length > 0 ? ` · ${retainedSectionNames.join("/")}` : ""}
                        </span>{" "}
                        for {preview.targetAcademicYear?.name}.
                      </li>
                    )}
                    {manualReviewCount > 0 && (
                      <li>{manualReviewCount} student{manualReviewCount === 1 ? "" : "s"} still need a manual decision before you can confirm.</li>
                    )}
                    <li>Existing historical enrollments will not be deleted.</li>
                    <li>Student permanent IDs remain unchanged.</li>
                    <li>New academic-year enrollment records are created.</li>
                    <li>Student numbers carry over unchanged; roll numbers are assigned fresh in the destination section.</li>
                  </ul>
                </div>
              </Card>

              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={resetSource}>
                  Cancel
                </Button>
                <Button icon={<CheckCircle2 className="size-4" />} disabled={!allDecided} onClick={() => setShowConfirmDialog(true)}>
                  Confirm Promotion
                </Button>
              </div>
              {!allDecided && (
                <p className="text-right text-sm text-foreground-muted">
                  Every student needs a decision — and a destination for Promote/Retain/Manual Review — before you can confirm.
                </p>
              )}
            </>
          )}
        </>
      )}

      <ConfirmDialog
        open={showConfirmDialog}
        title="Confirm Promotion"
        description="Students will be moved into new enrollment records for the selected academic year. Existing historical records will remain unchanged."
        confirmLabel="Confirm Promotion"
        tone="primary"
        loading={confirming}
        onConfirm={onConfirm}
        onCancel={() => setShowConfirmDialog(false)}
      />
    </div>
  );
}
