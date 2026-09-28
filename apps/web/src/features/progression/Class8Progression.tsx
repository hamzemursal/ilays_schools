"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  CircleDashed,
  GraduationCap,
  HelpCircle,
  RefreshCw,
  RotateCcw,
  School as SchoolIcon,
  Users,
} from "lucide-react";
import { ApiError, useAuth } from "@/lib/auth-context";
import {
  api,
  type AcademicYear,
  type ClassWithSections,
  type PromotionAssignment,
  type PromotionPreview,
  type PromotionSectionOption,
  type PromotionStudentRow,
  type ProgressionOverviewClass,
  type School,
} from "@/lib/api";
import { Card, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { Stepper } from "@/components/ui/Stepper";
import { EmptyState } from "@/components/ui/EmptyState";
import { SkeletonCards } from "@/components/ui/Skeleton";
import { FormField, Select } from "@/components/ui/FormControls";
import {
  DestinationChip,
  EligibilityPill,
  NoEnrollmentChip,
  OutcomeSegmented,
  ReviewGroup,
  SectionPicker,
  SummaryTile,
  WorkflowFacts,
  autoAssignSections,
  formatPercent,
} from "./shared";

// Class 8 Year-End Progression — ONE guided workflow for all three Class 8
// outcomes. Internally it runs the two existing, already-tested operations in
// order, never a new write path:
//   1. PromotionsService.confirm, per source section — Continue & Complete
//      students → COMPLETED (no enrollment), Retain → RETAINED + a new Class 8
//      enrollment in the next year;
//   2. StudentLifecycleService.confirmForm1Transition — the Continue students
//      (now COMPLETED) → a new ACTIVE Form 1 enrollment, in this school or
//      another school of the organization.
// If step 2 fails, step 1 is already committed: those students are safely
// COMPLETED ("awaiting Form 1") and the result screen offers a retry.

type Outcome = "CONTINUE" | "RETAIN" | "COMPLETE";
type Filter = "ALL" | Outcome | "INCOMPLETE";
type Row = PromotionStudentRow & { sectionId: string; sectionName: string };

const STEPS = [{ label: "Setup" }, { label: "Decide outcomes" }, { label: "Review & confirm" }, { label: "Done" }];

interface Form1Destination {
  schoolId: string;
  yearId: string;
  classId: string;
  className: string;
  sections: PromotionSectionOption[];
}

interface RunState {
  sectionsDone: string[];
  sectionError: { sectionName: string; message: string } | null;
  // Continue students already COMPLETED whose Form 1 enrollment is pending.
  pendingForm1: string[];
  form1Error: string | null;
  form1Enrolled: number;
  retained: number;
  completedOnly: number;
}

function defaultOutcome(s: PromotionStudentRow): Outcome | "" {
  if (s.eligible === null) return "";
  return s.eligible ? "CONTINUE" : "RETAIN";
}

export function Class8Progression({ schoolId, initialYearId }: { schoolId: string; initialYearId?: string }) {
  const { accessToken, user } = useAuth();
  const schoolName = user?.schools.find((s) => s.id === schoolId)?.name ?? "This school";

  const [step, setStep] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);

  // --- Source ---------------------------------------------------------------
  const [years, setYears] = useState<AcademicYear[]>([]);
  const [fromYearId, setFromYearId] = useState(initialYearId ?? "");
  // undefined = still loading for the selected year.
  const [loadedClass8, setLoadedClass8] = useState<{ yearId: string; cls: ProgressionOverviewClass | null } | null>(null);
  const class8 = loadedClass8?.yearId === fromYearId ? loadedClass8.cls : undefined;
  const [selectedSections, setSelectedSections] = useState<Set<string>>(new Set());

  // --- Form 1 destination ---------------------------------------------------
  const [schools, setSchools] = useState<School[]>([]);
  const [destSchoolId, setDestSchoolId] = useState("");
  const [destYears, setDestYears] = useState<AcademicYear[]>([]);
  const [destYearId, setDestYearId] = useState("");
  // Keyed by "school|year" so a changed destination shows as loading without
  // resetting state inside the effect.
  const [loadedDest, setLoadedDest] = useState<{ key: string; destination: Form1Destination | null; problem: string | null } | null>(null);

  // --- Decisions ------------------------------------------------------------
  const [previews, setPreviews] = useState<{ sectionId: string; sectionName: string; preview: PromotionPreview }[]>([]);
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [studentsError, setStudentsError] = useState<string | null>(null);
  const [outcomes, setOutcomes] = useState<Map<string, Outcome | "">>(new Map());
  const [continueOverrides, setContinueOverrides] = useState<Map<string, string>>(new Map());
  const [retainOverrides, setRetainOverrides] = useState<Map<string, string>>(new Map());
  const [filter, setFilter] = useState<Filter>("ALL");

  // --- Execution ------------------------------------------------------------
  const [running, setRunning] = useState(false);
  const [run, setRun] = useState<RunState | null>(null);

  const fromYear = years.find((y) => y.id === fromYearId);

  useEffect(() => {
    if (!accessToken) return;
    Promise.all([api.listAcademicYears(accessToken, schoolId), api.listSchools(accessToken)])
      .then(([y, s]) => {
        setYears(y);
        setSchools(s);
        setFromYearId((prev) => prev || (y.find((yr) => yr.isCurrent) ?? y[0])?.id || "");
        // Suggest where Form 1 lives: this school if it teaches Secondary,
        // otherwise the first Secondary school of the organization.
        const self = s.find((x) => x.id === schoolId);
        const teachesSecondary = (x: School) => x.type === "SECONDARY" || x.type === "PRIMARY_AND_SECONDARY";
        const suggested = self && teachesSecondary(self) ? self : (s.find((x) => x.id !== schoolId && teachesSecondary(x)) ?? self);
        setDestSchoolId(suggested?.id ?? schoolId);
      })
      .catch((err) => setLoadError(err instanceof ApiError ? err.message : "Failed to load academic years"));
  }, [accessToken, schoolId]);

  // Class 8 of the selected year, with each section's ACTIVE count.
  useEffect(() => {
    if (!accessToken || !fromYearId) return;
    let cancelled = false;
    api
      .getProgressionOverview(accessToken, schoolId, fromYearId)
      .then((o) => {
        if (cancelled) return;
        const c = o.classes.find((cl) => cl.divisionType === "PRIMARY" && cl.isFinal) ?? null;
        setLoadedClass8({ yearId: fromYearId, cls: c });
        setSelectedSections(new Set(c?.sections.filter((s) => s.activeCount > 0).map((s) => s.id) ?? []));
      })
      .catch((err) => !cancelled && setLoadError(err instanceof ApiError ? err.message : "Failed to load Class 8"));
    return () => {
      cancelled = true;
    };
  }, [accessToken, schoolId, fromYearId]);

  // Destination school → its academic years later than the Class 8 year.
  useEffect(() => {
    if (!accessToken || !destSchoolId || !fromYear) return;
    let cancelled = false;
    api
      .listAcademicYears(accessToken, destSchoolId)
      .then((y) => {
        if (cancelled) return;
        const later = y
          .filter((yr) => new Date(yr.startDate) > new Date(fromYear.startDate))
          .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());
        setDestYears(later);
        setDestYearId(later[0]?.id ?? "");
      })
      .catch(() => !cancelled && setDestYears([]));
    return () => {
      cancelled = true;
    };
  }, [accessToken, destSchoolId, fromYear]);

  // Destination year → its Form 1 class and live section capacity.
  const destKey = `${destSchoolId}|${destYearId}`;
  const destSchoolLabel = schools.find((s) => s.id === destSchoolId)?.name ?? "the destination school";
  const currentDest = loadedDest?.key === destKey ? loadedDest : null;
  const destination = destYearId ? (currentDest?.destination ?? null) : null;
  const destinationProblem = !destSchoolId
    ? null
    : !destYearId
      ? `${destSchoolLabel} has no academic year after ${fromYear?.name ?? "this year"} yet. Create it (Academic → Years) with a Form 1 class.`
      : (currentDest?.problem ?? null);

  useEffect(() => {
    if (!accessToken || !destSchoolId || !destYearId) return;
    let cancelled = false;
    const key = `${destSchoolId}|${destYearId}`;
    const destSchoolName = schools.find((s) => s.id === destSchoolId)?.name ?? "the destination school";
    const fail = (problem: string) => {
      if (!cancelled) setLoadedDest({ key, destination: null, problem });
    };
    api
      .listClasses(accessToken, destSchoolId, destYearId)
      .then(async (classes: ClassWithSections[]) => {
        const form1 = classes.find((c) => c.division.type === "SECONDARY" && c.level === 1);
        if (!form1) {
          fail(`${destSchoolName} has no Form 1 class in that academic year yet.`);
          return;
        }
        const capacity = await api.previewForm1Transition(accessToken, schoolId, {
          toClassId: form1.id,
          toAcademicYearId: destYearId,
          toSchoolId: destSchoolId === schoolId ? undefined : destSchoolId,
          enrollmentIds: [],
        });
        if (cancelled) return;
        if (capacity.targetSections.length === 0) {
          fail(`${form1.name} at ${destSchoolName} has no sections yet.`);
          return;
        }
        setLoadedDest({
          key,
          problem: null,
          destination: { schoolId: destSchoolId, yearId: destYearId, classId: form1.id, className: form1.name, sections: capacity.targetSections },
        });
      })
      .catch((err) => fail(err instanceof ApiError ? err.message : "Could not load the Form 1 destination"));
    return () => {
      cancelled = true;
    };
  }, [accessToken, schoolId, destSchoolId, destYearId, schools]);

  async function loadStudents() {
    if (!accessToken || !class8) return;
    setLoadingStudents(true);
    setStudentsError(null);
    try {
      const chosen = class8.sections.filter((s) => selectedSections.has(s.id));
      const results = await Promise.all(
        chosen.map(async (s) => ({
          sectionId: s.id,
          sectionName: s.name,
          preview: await api.previewPromotion(accessToken, schoolId, s.id, fromYearId),
        })),
      );
      setPreviews(results);
      const initial = new Map<string, Outcome | "">();
      for (const r of results) for (const st of r.preview.students) initial.set(st.enrollmentId, defaultOutcome(st));
      setOutcomes(initial);
      setContinueOverrides(new Map());
      setRetainOverrides(new Map());
      setFilter("ALL");
      setStep(1);
    } catch (err) {
      setStudentsError(err instanceof ApiError ? err.message : "Failed to load Class 8 students");
    } finally {
      setLoadingStudents(false);
    }
  }

  const rows: Row[] = useMemo(
    () => previews.flatMap((p) => p.preview.students.map((s) => ({ ...s, sectionId: p.sectionId, sectionName: p.sectionName }))),
    [previews],
  );

  // Retention always stays in THIS school: next year's Class 8 (from the
  // backend's own preview — the same pool for every source section).
  const retainPreview = previews.find((p) => p.preview.targetAcademicYear) ?? null;
  const retainYear = retainPreview?.preview.targetAcademicYear ?? null;
  const retainPool = retainPreview?.preview.currentClassSections ?? [];
  const retainClassName = retainPreview?.preview.retainedClass?.name ?? class8?.name ?? "Class 8";

  const outcomeOf = (id: string) => outcomes.get(id) ?? "";
  const idsWith = (o: Outcome) => rows.filter((r) => outcomeOf(r.enrollmentId) === o).map((r) => r.enrollmentId);

  const continueSections = useMemo(
    () => autoAssignSections(idsWith("CONTINUE"), destination?.sections ?? [], continueOverrides),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, outcomes, destination, continueOverrides],
  );
  const retainSections = useMemo(
    () => autoAssignSections(idsWith("RETAIN"), retainPool, retainOverrides),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, outcomes, retainPool, retainOverrides],
  );

  const counts = {
    total: rows.length,
    CONTINUE: idsWith("CONTINUE").length,
    RETAIN: idsWith("RETAIN").length,
    COMPLETE: idsWith("COMPLETE").length,
    undecided: rows.filter((r) => !outcomeOf(r.enrollmentId)).length,
    incomplete: rows.filter((r) => r.eligible === null).length,
  };

  const problems: string[] = [];
  if (counts.undecided > 0)
    problems.push(`${counts.undecided} student(s) have incomplete results — retain them, or publish their results first to move them on.`);
  if (counts.CONTINUE > 0 && !destination) problems.push("Form 1 destination isn't ready — fix it in Setup, or choose another outcome.");
  if (counts.CONTINUE > 0 && destination && idsWith("CONTINUE").some((id) => !continueSections.get(id)))
    problems.push("Form 1 sections are full — some continuing students have no section.");
  if (counts.RETAIN > 0 && !retainYear) problems.push("There is no next academic year to retain students in. Create it first (Academic → Years).");
  if (counts.RETAIN > 0 && retainYear && idsWith("RETAIN").some((id) => !retainSections.get(id)))
    problems.push(`No ${retainClassName} section is available in ${retainYear.name} for some retained students.`);
  const canConfirm = rows.length > 0 && problems.length === 0;

  const destSchoolName = schools.find((s) => s.id === destination?.schoolId)?.name ?? schoolName;
  const destYearName = destYears.find((y) => y.id === destination?.yearId)?.name ?? "";
  const sectionName = (pool: PromotionSectionOption[], id?: string) => pool.find((s) => s.id === id)?.name ?? "—";

  // --- Execution ------------------------------------------------------------
  async function runForm1(pending: string[], base: RunState): Promise<RunState> {
    if (!accessToken || !destination || pending.length === 0) return { ...base, pendingForm1: [] };
    try {
      const res = await api.confirmForm1Transition(accessToken, schoolId, {
        toClassId: destination.classId,
        toAcademicYearId: destination.yearId,
        toSchoolId: destination.schoolId === schoolId ? undefined : destination.schoolId,
        assignments: pending.map((id) => ({ enrollmentId: id, sectionId: continueSections.get(id)! })),
      });
      return { ...base, pendingForm1: [], form1Error: null, form1Enrolled: base.form1Enrolled + res.results.length };
    } catch (err) {
      return { ...base, pendingForm1: pending, form1Error: err instanceof ApiError ? err.message : "Form 1 enrollment failed" };
    }
  }

  async function confirmAll() {
    if (!accessToken || !canConfirm) return;
    setRunning(true);
    let state: RunState = { sectionsDone: [], sectionError: null, pendingForm1: [], form1Error: null, form1Enrolled: 0, retained: 0, completedOnly: 0 };
    const continuing: string[] = [];

    for (const p of previews) {
      const sectionRows = rows.filter((r) => r.sectionId === p.sectionId);
      if (sectionRows.length === 0) continue;
      const assignments: PromotionAssignment[] = sectionRows.map((r) => {
        const o = outcomeOf(r.enrollmentId);
        return o === "RETAIN"
          ? { enrollmentId: r.enrollmentId, outcome: "RETAINED", targetSectionId: retainSections.get(r.enrollmentId) }
          : { enrollmentId: r.enrollmentId, outcome: "COMPLETED" };
      });
      const needsYear = assignments.some((a) => a.outcome === "RETAINED");
      try {
        await api.confirmPromotion(accessToken, schoolId, p.sectionId, {
          fromAcademicYearId: fromYearId,
          toAcademicYearId: needsYear ? retainYear?.id : undefined,
          assignments,
        });
        state = {
          ...state,
          sectionsDone: [...state.sectionsDone, p.sectionName],
          retained: state.retained + sectionRows.filter((r) => outcomeOf(r.enrollmentId) === "RETAIN").length,
          completedOnly: state.completedOnly + sectionRows.filter((r) => outcomeOf(r.enrollmentId) === "COMPLETE").length,
        };
        continuing.push(...sectionRows.filter((r) => outcomeOf(r.enrollmentId) === "CONTINUE").map((r) => r.enrollmentId));
      } catch (err) {
        state = { ...state, sectionError: { sectionName: p.sectionName, message: err instanceof ApiError ? err.message : "Failed" } };
        break;
      }
    }

    state = await runForm1(continuing, state);
    setRun(state);
    setRunning(false);
    setStep(3);
  }

  async function retryForm1() {
    if (!run) return;
    setRunning(true);
    setRun(await runForm1(run.pendingForm1, run));
    setRunning(false);
  }

  // --- Render ---------------------------------------------------------------
  if (loadError) return <Alert tone="danger">{loadError}</Alert>;

  const selectedSectionNames = class8?.sections.filter((s) => selectedSections.has(s.id)).map((s) => s.name) ?? [];
  const facts = [
    { label: "Academic Year", value: fromYear?.name ?? "—" },
    { label: "School", value: schoolName },
    { label: "Class", value: class8?.name ?? "Class 8" },
    { label: "Sections", value: selectedSectionNames.length ? selectedSectionNames.join(", ") : "—" },
  ];

  const visibleRows = rows.filter((r) => {
    if (filter === "ALL") return true;
    if (filter === "INCOMPLETE") return r.eligible === null;
    return outcomeOf(r.enrollmentId) === filter;
  });

  return (
    <div className="space-y-5">
      <Stepper steps={STEPS} currentIndex={step} />
      <WorkflowFacts facts={facts} />

      {step === 0 && (
        <div className="grid gap-5 lg:grid-cols-2">
          <Card padding="none">
            <CardHeader title="Class 8 students" description="Choose the year and the sections to progress." />
            <div className="space-y-4 p-5">
              <FormField label="Academic year" htmlFor="c8-year">
                <Select id="c8-year" value={fromYearId} onChange={(e) => setFromYearId(e.target.value)}>
                  {years.map((y) => (
                    <option key={y.id} value={y.id}>
                      {y.name}
                      {y.isCurrent ? " (current)" : ""}
                    </option>
                  ))}
                </Select>
              </FormField>
              {class8 === undefined ? (
                <SkeletonCards count={1} />
              ) : class8 === null ? (
                <EmptyState icon={GraduationCap} title="No Class 8 in this year" description="Create Class 8 for this academic year first (Academic → Classes)." />
              ) : class8.sections.every((s) => s.activeCount === 0) ? (
                <EmptyState
                  icon={CheckCircle2}
                  title="Class 8 is already progressed"
                  description={`No active Class 8 students remain in ${fromYear?.name ?? "this year"}.`}
                />
              ) : (
                <SectionPicker
                  sections={class8.sections.filter((s) => s.activeCount > 0)}
                  selected={selectedSections}
                  onChange={setSelectedSections}
                />
              )}
            </div>
          </Card>

          <Card padding="none">
            <CardHeader
              title="Form 1 destination"
              description="Where continuing students start Form 1. Suggested automatically — change only if needed."
            />
            <div className="space-y-4 p-5">
              <div className="grid gap-3 sm:grid-cols-2">
                <FormField label="Secondary school" htmlFor="c8-dest-school">
                  <Select id="c8-dest-school" value={destSchoolId} onChange={(e) => setDestSchoolId(e.target.value)}>
                    {schools.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                        {s.id === schoolId ? " (this school)" : ""}
                      </option>
                    ))}
                  </Select>
                </FormField>
                <FormField label="Academic year" htmlFor="c8-dest-year">
                  <Select id="c8-dest-year" value={destYearId} onChange={(e) => setDestYearId(e.target.value)} disabled={destYears.length === 0}>
                    {destYears.length === 0 && <option value="">No later year</option>}
                    {destYears.map((y) => (
                      <option key={y.id} value={y.id}>
                        {y.name}
                      </option>
                    ))}
                  </Select>
                </FormField>
              </div>
              {destination ? (
                <div className="rounded-lg border border-accent/25 bg-accent-soft/30 p-3 text-sm">
                  <p className="flex items-center gap-2 font-medium text-foreground">
                    <SchoolIcon className="size-4 text-accent" />
                    {destSchoolName} · {destYearName} · {destination.className}
                  </p>
                  <p className="mt-1 text-foreground-soft">
                    Sections:{" "}
                    {destination.sections
                      .map((s) => `${s.name} (${s.available === null ? "no limit" : `${s.available} free`})`)
                      .join(", ")}
                  </p>
                </div>
              ) : destinationProblem ? (
                <Alert tone="warning">{destinationProblem} Students can still be retained or completed without Form 1.</Alert>
              ) : (
                <SkeletonCards count={1} />
              )}
              <p className="text-xs text-foreground-muted">
                Retained students repeat Class 8 in {schoolName} in the next academic year. Student IDs never change.
              </p>
            </div>
          </Card>

          <div className="flex justify-end lg:col-span-2">
            <Button
              icon={<ArrowRight className="size-4" />}
              loading={loadingStudents}
              disabled={!class8 || selectedSections.size === 0}
              onClick={loadStudents}
            >
              Load {selectedSections.size} section{selectedSections.size === 1 ? "" : "s"}
            </Button>
          </div>
          {studentsError && (
            <Alert tone="danger" className="lg:col-span-2">
              {studentsError}
            </Alert>
          )}
        </div>
      )}

      {step === 1 && (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
            <SummaryTile icon={Users} label="Total students" value={counts.total} tone="neutral" active={filter === "ALL"} onClick={() => setFilter("ALL")} />
            <SummaryTile icon={ArrowRight} label="Continue to Form 1" value={counts.CONTINUE} tone="accent" active={filter === "CONTINUE"} onClick={() => setFilter("CONTINUE")} />
            <SummaryTile icon={RotateCcw} label="Retain in Class 8" value={counts.RETAIN} tone="warning" active={filter === "RETAIN"} onClick={() => setFilter("RETAIN")} />
            <SummaryTile icon={CircleDashed} label="Not continuing" value={counts.COMPLETE} tone="neutral" active={filter === "COMPLETE"} onClick={() => setFilter("COMPLETE")} />
            {counts.incomplete > 0 && (
              <SummaryTile icon={HelpCircle} label="Incomplete results" value={counts.incomplete} tone="danger" active={filter === "INCOMPLETE"} onClick={() => setFilter("INCOMPLETE")} />
            )}
          </div>

          <Card padding="none">
            <CardHeader
              title="Student outcomes"
              description={
                destination
                  ? `Suggested from the annual result (50% pass mark). Form 1 is at ${destSchoolName}; retained students stay at ${schoolName}.`
                  : "Suggested from the annual result (50% pass mark). Change only the exceptions."
              }
              actions={
                <div className="flex flex-wrap gap-1" role="group" aria-label="Filter">
                  {(
                    [
                      ["ALL", "All"],
                      ["CONTINUE", "Form 1"],
                      ["RETAIN", "Retain"],
                      ["COMPLETE", "Complete"],
                      ["INCOMPLETE", "Incomplete"],
                    ] as [Filter, string][]
                  ).map(([f, label]) => (
                    <button
                      key={f}
                      type="button"
                      aria-pressed={filter === f}
                      onClick={() => setFilter(f)}
                      className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                        filter === f ? "bg-accent text-white" : "bg-surface-soft text-foreground-soft hover:text-foreground"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              }
            />
            {rows.length === 0 ? (
              <EmptyState icon={Users} title="No active students" description="The selected sections have no active Class 8 students." />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1080px] text-left text-sm">
                  <thead className="whitespace-nowrap bg-surface-soft text-xs font-semibold uppercase tracking-wide text-foreground-muted">
                    <tr>
                      <th className="px-4 py-2.5">Student</th>
                      <th className="px-3 py-2.5">Student ID</th>
                      <th className="px-3 py-2.5">Section</th>
                      <th className="px-3 py-2.5 text-right">Term 1</th>
                      <th className="px-3 py-2.5 text-right">Term 2</th>
                      <th className="px-3 py-2.5 text-right">Annual</th>
                      <th className="px-3 py-2.5">Eligibility</th>
                      <th className="px-3 py-2.5">Outcome</th>
                      <th className="px-4 py-2.5">Destination</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {visibleRows.map((r) => {
                      const o = outcomeOf(r.enrollmentId);
                      const name = `${r.firstName} ${r.lastName}`;
                      // Only a complete result of at least 50% can move on;
                      // below 50% or Incomplete can only be retained.
                      const failed = r.eligible !== true;
                      const blockedReason = r.eligible === null ? "Incomplete results — publish them first" : "Below the 50% pass mark";
                      return (
                        <tr key={r.enrollmentId} className={o === "" ? "bg-warning-soft/30" : undefined}>
                          <td className="px-4 py-2.5 font-medium text-foreground">{name}</td>
                          <td className="whitespace-nowrap px-3 py-2.5 font-mono text-xs text-foreground-soft">{r.studentNumber}</td>
                          <td className="px-3 py-2.5 text-foreground-soft">{r.sectionName}</td>
                          <td className="px-3 py-2.5 text-right tabular-nums text-foreground-soft">{formatPercent(r.term1Percentage)}</td>
                          <td className="px-3 py-2.5 text-right tabular-nums text-foreground-soft">{formatPercent(r.term2Percentage)}</td>
                          <td className="px-3 py-2.5 text-right font-semibold tabular-nums text-foreground">{formatPercent(r.annualPercentage)}</td>
                          <td className="px-3 py-2.5">
                            <EligibilityPill eligible={r.eligible} />
                          </td>
                          <td className="px-3 py-2.5">
                            <OutcomeSegmented<Outcome>
                              label={`Outcome for ${name}`}
                              value={o}
                              onChange={(v) => setOutcomes((prev) => new Map(prev).set(r.enrollmentId, v))}
                              options={[
                                { value: "CONTINUE", label: "Form 1", tone: "accent", disabled: failed, disabledReason: blockedReason },
                                { value: "RETAIN", label: "Retain", tone: "warning" },
                                { value: "COMPLETE", label: "Complete", tone: "neutral", disabled: failed, disabledReason: blockedReason },
                              ]}
                            />
                          </td>
                          <td className="px-4 py-2.5">
                            {o === "CONTINUE" &&
                              (destination ? (
                                <DestinationChip
                                  parts={[destination.className, destYearName]}
                                  sections={destination.sections}
                                  sectionId={continueSections.get(r.enrollmentId)}
                                  onSectionChange={(id) => setContinueOverrides((prev) => new Map(prev).set(r.enrollmentId, id))}
                                  ariaLabel={`Form 1 section for ${name}`}
                                />
                              ) : (
                                <span className="text-xs font-medium text-danger">Form 1 destination not ready</span>
                              ))}
                            {o === "RETAIN" &&
                              (retainYear ? (
                                <DestinationChip
                                  tone="warning"
                                  parts={[retainYear.name, retainClassName]}
                                  sections={retainPool}
                                  sectionId={retainSections.get(r.enrollmentId)}
                                  onSectionChange={(id) => setRetainOverrides((prev) => new Map(prev).set(r.enrollmentId, id))}
                                  ariaLabel={`Class 8 section for ${name}`}
                                />
                              ) : (
                                <span className="text-xs font-medium text-danger">No next academic year</span>
                              ))}
                            {o === "COMPLETE" && <NoEnrollmentChip />}
                            {o === "" && <span className="text-xs font-medium text-warning">Choose an outcome</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {visibleRows.length === 0 && <p className="p-6 text-center text-sm text-foreground-muted">No students match this filter.</p>}
              </div>
            )}
          </Card>

          {problems.length > 0 && (
            <Alert tone="warning">
              {problems.map((p) => (
                <p key={p}>{p}</p>
              ))}
            </Alert>
          )}

          <div className="flex justify-between">
            <Button variant="outline" icon={<ArrowLeft className="size-4" />} onClick={() => setStep(0)}>
              Back
            </Button>
            <Button icon={<ArrowRight className="size-4" />} disabled={!canConfirm} onClick={() => setStep(2)}>
              Review
            </Button>
          </div>
        </>
      )}

      {step === 2 && (
        <>
          <div className="grid gap-4 lg:grid-cols-3">
            <ReviewGroup
              icon={ArrowRight}
              tone="accent"
              title="Continue to Form 1"
              count={counts.CONTINUE}
              flow={[
                [`${class8?.name ?? "Class 8"}`, "COMPLETED"],
                [destSchoolName, `${destination?.className ?? "Form 1"} · ${destYearName}`, "ACTIVE"],
              ]}
            >
              {counts.CONTINUE > 0 && destination && (
                <p className="mt-3 text-xs text-foreground-muted">
                  Sections:{" "}
                  {[...new Set(idsWith("CONTINUE").map((id) => sectionName(destination.sections, continueSections.get(id))))].join(", ")}
                </p>
              )}
            </ReviewGroup>
            <ReviewGroup
              icon={RotateCcw}
              tone="warning"
              title="Retain"
              count={counts.RETAIN}
              flow={[
                [`${class8?.name ?? "Class 8"}`, "RETAINED"],
                [retainYear?.name ?? "Next year", retainClassName, "ACTIVE"],
              ]}
            />
            <ReviewGroup
              icon={CircleDashed}
              tone="neutral"
              title="Complete — not continuing"
              count={counts.COMPLETE}
              flow={[[`${class8?.name ?? "Class 8"}`, "COMPLETED"], ["No new enrollment"]]}
            />
          </div>

          <Card>
            <ul className="space-y-1.5 text-sm text-foreground-soft">
              <li className="flex gap-2">
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" /> Every student keeps the same permanent Student ID.
              </li>
              <li className="flex gap-2">
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" /> Class 8 enrollments stay in history; results and attendance are untouched.
              </li>
              <li className="flex gap-2">
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" /> New enrollments are created only for Form 1 and retained students.
              </li>
            </ul>
          </Card>

          <div className="flex justify-between">
            <Button variant="outline" icon={<ArrowLeft className="size-4" />} onClick={() => setStep(1)} disabled={running}>
              Back
            </Button>
            <Button icon={<CheckCircle2 className="size-4" />} loading={running} disabled={!canConfirm} onClick={confirmAll}>
              Confirm Class 8 progression
            </Button>
          </div>
        </>
      )}

      {step === 3 && run && (
        <Class8Result
          run={run}
          schoolId={schoolId}
          running={running}
          onRetryForm1={retryForm1}
          destinationLabel={`${destSchoolName} · ${destination?.className ?? "Form 1"}`}
        />
      )}
    </div>
  );
}

function Class8Result({
  run,
  schoolId,
  running,
  onRetryForm1,
  destinationLabel,
}: {
  run: RunState;
  schoolId: string;
  running: boolean;
  onRetryForm1: () => void;
  destinationLabel: string;
}) {
  const fullySucceeded = !run.sectionError && run.pendingForm1.length === 0;
  return (
    <div className="space-y-4">
      <Card>
        <div className="flex items-start gap-4">
          <span
            className={`flex size-11 shrink-0 items-center justify-center rounded-full ${fullySucceeded ? "bg-success-soft text-success" : "bg-warning-soft text-warning"}`}
          >
            {fullySucceeded ? <CheckCircle2 className="size-6" /> : <AlertTriangle className="size-6" />}
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-semibold text-foreground">
              {fullySucceeded ? "Class 8 progression complete" : "Class 8 progression partly complete"}
            </h2>
            <dl className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="rounded-lg bg-accent-soft/40 p-3">
                <dt className="text-xs text-foreground-soft">Enrolled in Form 1</dt>
                <dd className="text-xl font-semibold tabular-nums text-foreground">{run.form1Enrolled}</dd>
              </div>
              <div className="rounded-lg bg-warning-soft/50 p-3">
                <dt className="text-xs text-foreground-soft">Retained in Class 8</dt>
                <dd className="text-xl font-semibold tabular-nums text-foreground">{run.retained}</dd>
              </div>
              <div className="rounded-lg bg-surface-soft p-3">
                <dt className="text-xs text-foreground-soft">Completed — not continuing</dt>
                <dd className="text-xl font-semibold tabular-nums text-foreground">{run.completedOnly}</dd>
              </div>
            </dl>
          </div>
        </div>
      </Card>

      {run.sectionError && (
        <Alert tone="danger">
          <p className="font-medium">Section {run.sectionError.sectionName} was not progressed.</p>
          <p className="mt-1">{run.sectionError.message}</p>
          <p className="mt-1">
            {run.sectionsDone.length > 0 ? `Sections ${run.sectionsDone.join(", ")} were saved. ` : ""}Nothing was changed for Section{" "}
            {run.sectionError.sectionName} or later sections — fix the issue and run the workflow again for them.
          </p>
        </Alert>
      )}

      {run.pendingForm1.length > 0 && (
        <Card>
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 size-5 shrink-0 text-warning" />
            <div className="min-w-0 flex-1">
              <h3 className="font-semibold text-foreground">
                {run.pendingForm1.length} student{run.pendingForm1.length === 1 ? " is" : "s are"} waiting for Form 1 enrollment
              </h3>
              <p className="mt-1 text-sm text-foreground-soft">
                Their Class 8 enrollment is saved as COMPLETED, but the Form 1 step ({destinationLabel}) did not finish:{" "}
                <span className="font-medium text-foreground">{run.form1Error}</span>. No data was lost — they are listed under
                Awaiting Enrollment until they are enrolled.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button size="sm" icon={<RefreshCw className="size-4" />} loading={running} onClick={onRetryForm1}>
                  Retry Form 1 enrollment
                </Button>
                <Link href={`/schools/${schoolId}/student-lifecycle/awaiting-enrollment`}>
                  <Button size="sm" variant="outline">
                    Open Awaiting Enrollment
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </Card>
      )}

      <div className="flex flex-wrap gap-2">
        <Link href={`/schools/${schoolId}/promotions`}>
          <Button variant="outline" icon={<ArrowLeft className="size-4" />}>
            Back to Year-End Progression
          </Button>
        </Link>
        <Link href={`/schools/${schoolId}/students`}>
          <Button variant="outline">View students</Button>
        </Link>
      </div>
    </div>
  );
}
