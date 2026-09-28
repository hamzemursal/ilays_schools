"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowLeft, ArrowRight, Award, CheckCircle2, GraduationCap, HelpCircle, RotateCcw, Users } from "lucide-react";
import { ApiError, useAuth } from "@/lib/auth-context";
import {
  api,
  type AcademicYear,
  type PromotionAssignment,
  type PromotionPreview,
  type PromotionStudentRow,
  type ProgressionOverviewClass,
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

// Form 4 Graduation — the final Secondary class. Graduates get NO destination
// at all (no Form 5, no year, class, section or enrollment): the existing
// PromotionsService.confirm marks them GRADUATED and they appear in the
// Alumni Directory. Only a retained student needs a destination, and only
// then is the next academic year used. One confirm call per source section,
// in order; a failure stops before the next section and is reported.

type Outcome = "GRADUATE" | "RETAIN";
type Filter = "ALL" | Outcome | "INCOMPLETE";
type Row = PromotionStudentRow & { sectionId: string; sectionName: string };

const STEPS = [{ label: "Sections" }, { label: "Decide outcomes" }, { label: "Review & confirm" }, { label: "Done" }];

function defaultOutcome(s: PromotionStudentRow): Outcome | "" {
  if (s.eligible === null) return "";
  return s.eligible ? "GRADUATE" : "RETAIN";
}

interface RunState {
  graduated: number;
  retained: number;
  sectionsDone: string[];
  sectionError: { sectionName: string; message: string } | null;
}

export function Form4Graduation({ schoolId, initialYearId }: { schoolId: string; initialYearId?: string }) {
  const { accessToken, user } = useAuth();
  const schoolName = user?.schools.find((s) => s.id === schoolId)?.name ?? "This school";

  const [step, setStep] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [years, setYears] = useState<AcademicYear[]>([]);
  const [fromYearId, setFromYearId] = useState(initialYearId ?? "");
  // undefined = still loading for the selected year.
  const [loadedForm4, setLoadedForm4] = useState<{ yearId: string; cls: ProgressionOverviewClass | null } | null>(null);
  const form4 = loadedForm4?.yearId === fromYearId ? loadedForm4.cls : undefined;
  const [selectedSections, setSelectedSections] = useState<Set<string>>(new Set());

  const [previews, setPreviews] = useState<{ sectionId: string; sectionName: string; preview: PromotionPreview }[]>([]);
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [studentsError, setStudentsError] = useState<string | null>(null);
  const [outcomes, setOutcomes] = useState<Map<string, Outcome | "">>(new Map());
  const [retainOverrides, setRetainOverrides] = useState<Map<string, string>>(new Map());
  const [filter, setFilter] = useState<Filter>("ALL");

  const [running, setRunning] = useState(false);
  const [run, setRun] = useState<RunState | null>(null);

  const fromYear = years.find((y) => y.id === fromYearId);

  useEffect(() => {
    if (!accessToken) return;
    api
      .listAcademicYears(accessToken, schoolId)
      .then((y) => {
        setYears(y);
        setFromYearId((prev) => prev || (y.find((yr) => yr.isCurrent) ?? y[0])?.id || "");
      })
      .catch((err) => setLoadError(err instanceof ApiError ? err.message : "Failed to load academic years"));
  }, [accessToken, schoolId]);

  useEffect(() => {
    if (!accessToken || !fromYearId) return;
    let cancelled = false;
    api
      .getProgressionOverview(accessToken, schoolId, fromYearId)
      .then((o) => {
        if (cancelled) return;
        const c = o.classes.find((cl) => cl.divisionType === "SECONDARY" && cl.isFinal) ?? null;
        setLoadedForm4({ yearId: fromYearId, cls: c });
        setSelectedSections(new Set(c?.sections.filter((s) => s.activeCount > 0).map((s) => s.id) ?? []));
      })
      .catch((err) => !cancelled && setLoadError(err instanceof ApiError ? err.message : "Failed to load Form 4"));
    return () => {
      cancelled = true;
    };
  }, [accessToken, schoolId, fromYearId]);

  async function loadStudents() {
    if (!accessToken || !form4) return;
    setLoadingStudents(true);
    setStudentsError(null);
    try {
      const chosen = form4.sections.filter((s) => selectedSections.has(s.id));
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
      setRetainOverrides(new Map());
      setFilter("ALL");
      setStep(1);
    } catch (err) {
      setStudentsError(err instanceof ApiError ? err.message : "Failed to load Form 4 students");
    } finally {
      setLoadingStudents(false);
    }
  }

  const rows: Row[] = useMemo(
    () => previews.flatMap((p) => p.preview.students.map((s) => ({ ...s, sectionId: p.sectionId, sectionName: p.sectionName }))),
    [previews],
  );
  const outcomeOf = (id: string) => outcomes.get(id) ?? "";
  const idsWith = (o: Outcome) => rows.filter((r) => outcomeOf(r.enrollmentId) === o).map((r) => r.enrollmentId);

  const retainPreview = previews.find((p) => p.preview.targetAcademicYear) ?? null;
  const retainYear = retainPreview?.preview.targetAcademicYear ?? null;
  const retainPool = retainPreview?.preview.currentClassSections ?? [];
  const retainClassName = retainPreview?.preview.retainedClass?.name ?? form4?.name ?? "Form 4";

  const retainSections = useMemo(
    () => autoAssignSections(idsWith("RETAIN"), retainPool, retainOverrides),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, outcomes, retainPool, retainOverrides],
  );

  const counts = {
    total: rows.length,
    GRADUATE: idsWith("GRADUATE").length,
    RETAIN: idsWith("RETAIN").length,
    undecided: rows.filter((r) => !outcomeOf(r.enrollmentId)).length,
    incomplete: rows.filter((r) => r.eligible === null).length,
  };

  const problems: string[] = [];
  if (counts.undecided > 0) problems.push(`${counts.undecided} student(s) with incomplete results still need an outcome.`);
  if (counts.RETAIN > 0 && !retainYear) problems.push("Retaining needs the next academic year — create it first (Academic → Years), or graduate these students.");
  if (counts.RETAIN > 0 && retainYear && idsWith("RETAIN").some((id) => !retainSections.get(id)))
    problems.push(`No ${retainClassName} section is available in ${retainYear.name} for some retained students.`);
  const canConfirm = rows.length > 0 && problems.length === 0;

  async function confirmAll() {
    if (!accessToken || !canConfirm) return;
    setRunning(true);
    let state: RunState = { graduated: 0, retained: 0, sectionsDone: [], sectionError: null };
    for (const p of previews) {
      const sectionRows = rows.filter((r) => r.sectionId === p.sectionId);
      if (sectionRows.length === 0) continue;
      const assignments: PromotionAssignment[] = sectionRows.map((r) =>
        outcomeOf(r.enrollmentId) === "RETAIN"
          ? { enrollmentId: r.enrollmentId, outcome: "RETAINED", targetSectionId: retainSections.get(r.enrollmentId) }
          : { enrollmentId: r.enrollmentId, outcome: "GRADUATED" },
      );
      const retainedHere = assignments.filter((a) => a.outcome === "RETAINED").length;
      try {
        await api.confirmPromotion(accessToken, schoolId, p.sectionId, {
          fromAcademicYearId: fromYearId,
          // Only a retention needs a destination year — graduation never does.
          toAcademicYearId: retainedHere > 0 ? retainYear?.id : undefined,
          assignments,
        });
        state = {
          ...state,
          graduated: state.graduated + assignments.length - retainedHere,
          retained: state.retained + retainedHere,
          sectionsDone: [...state.sectionsDone, p.sectionName],
        };
      } catch (err) {
        state = { ...state, sectionError: { sectionName: p.sectionName, message: err instanceof ApiError ? err.message : "Failed" } };
        break;
      }
    }
    setRun(state);
    setRunning(false);
    setStep(3);
  }

  if (loadError) return <Alert tone="danger">{loadError}</Alert>;

  const selectedSectionNames = form4?.sections.filter((s) => selectedSections.has(s.id)).map((s) => s.name) ?? [];
  const visibleRows = rows.filter((r) => {
    if (filter === "ALL") return true;
    if (filter === "INCOMPLETE") return r.eligible === null;
    return outcomeOf(r.enrollmentId) === filter;
  });

  return (
    <div className="space-y-5">
      <Stepper steps={STEPS} currentIndex={step} />
      <WorkflowFacts
        facts={[
          { label: "Academic Year", value: fromYear?.name ?? "—" },
          { label: "School", value: schoolName },
          { label: "Class", value: form4?.name ?? "Form 4" },
          { label: "Sections", value: selectedSectionNames.length ? selectedSectionNames.join(", ") : "—" },
        ]}
      />

      {step === 0 && (
        <Card padding="none">
          <CardHeader
            title="Choose Form 4 sections"
            description="Form 4 is the final Secondary class. Graduates become Alumni — there is no Form 5 and no destination to fill in."
          />
          <div className="space-y-4 p-5">
            <FormField label="Academic year" htmlFor="f4-year">
              <Select id="f4-year" value={fromYearId} onChange={(e) => setFromYearId(e.target.value)} className="max-w-xs">
                {years.map((y) => (
                  <option key={y.id} value={y.id}>
                    {y.name}
                    {y.isCurrent ? " (current)" : ""}
                  </option>
                ))}
              </Select>
            </FormField>
            {form4 === undefined ? (
              <SkeletonCards count={1} />
            ) : form4 === null ? (
              <EmptyState icon={GraduationCap} title="No Form 4 in this year" description="Create Form 4 for this academic year first (Academic → Classes)." />
            ) : form4.sections.every((s) => s.activeCount === 0) ? (
              <EmptyState icon={CheckCircle2} title="Form 4 is already graduated" description={`No active Form 4 students remain in ${fromYear?.name ?? "this year"}.`} />
            ) : (
              <SectionPicker sections={form4.sections.filter((s) => s.activeCount > 0)} selected={selectedSections} onChange={setSelectedSections} />
            )}
            {studentsError && <Alert tone="danger">{studentsError}</Alert>}
          </div>
          <div className="flex justify-end border-t border-border p-5">
            <Button icon={<ArrowRight className="size-4" />} loading={loadingStudents} disabled={!form4 || selectedSections.size === 0} onClick={loadStudents}>
              Review {selectedSections.size} section{selectedSections.size === 1 ? "" : "s"}
            </Button>
          </div>
        </Card>
      )}

      {step === 1 && (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <SummaryTile icon={Users} label="Total students" value={counts.total} tone="neutral" active={filter === "ALL"} onClick={() => setFilter("ALL")} />
            <SummaryTile icon={Award} label="Graduate" value={counts.GRADUATE} tone="success" active={filter === "GRADUATE"} onClick={() => setFilter("GRADUATE")} />
            <SummaryTile icon={RotateCcw} label="Retain in Form 4" value={counts.RETAIN} tone="warning" active={filter === "RETAIN"} onClick={() => setFilter("RETAIN")} />
            {counts.incomplete > 0 && (
              <SummaryTile icon={HelpCircle} label="Incomplete results" value={counts.incomplete} tone="danger" active={filter === "INCOMPLETE"} onClick={() => setFilter("INCOMPLETE")} />
            )}
          </div>

          <Card padding="none">
            <CardHeader title="Graduation review" description="Suggested from the annual result (50% pass mark). Change only the exceptions." />
            {rows.length === 0 ? (
              <EmptyState icon={Users} title="No active students" description="The selected sections have no active Form 4 students." />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[960px] text-left text-sm">
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
                      <th className="px-4 py-2.5">Result</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {visibleRows.map((r) => {
                      const o = outcomeOf(r.enrollmentId);
                      const name = `${r.firstName} ${r.lastName}`;
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
                                { value: "GRADUATE", label: "Graduate", tone: "success", disabled: r.eligible === false, disabledReason: "Below the 50% pass mark" },
                                { value: "RETAIN", label: "Retain", tone: "warning" },
                              ]}
                            />
                          </td>
                          <td className="px-4 py-2.5">
                            {o === "GRADUATE" && <NoEnrollmentChip label="Graduated → Alumni" />}
                            {o === "RETAIN" &&
                              (retainYear ? (
                                <DestinationChip
                                  tone="warning"
                                  parts={[retainYear.name, retainClassName]}
                                  sections={retainPool}
                                  sectionId={retainSections.get(r.enrollmentId)}
                                  onSectionChange={(id) => setRetainOverrides((prev) => new Map(prev).set(r.enrollmentId, id))}
                                  ariaLabel={`Form 4 section for ${name}`}
                                />
                              ) : (
                                <span className="text-xs font-medium text-danger">No next academic year</span>
                              ))}
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
          <Card>
            <p className="text-base text-foreground" data-testid="graduation-statement">
              <span className="font-semibold">
                {counts.GRADUATE} student{counts.GRADUATE === 1 ? "" : "s"}
              </span>{" "}
              will graduate and become Alumni.
              {counts.RETAIN > 0 && (
                <>
                  {" "}
                  <span className="font-semibold">
                    {counts.RETAIN} student{counts.RETAIN === 1 ? "" : "s"}
                  </span>{" "}
                  will repeat {retainClassName} in {retainYear?.name}.
                </>
              )}{" "}
              No Form 5 will be created.
            </p>
          </Card>
          <div className="grid gap-4 md:grid-cols-2">
            <ReviewGroup
              icon={Award}
              tone="success"
              title="Graduate"
              count={counts.GRADUATE}
              flow={[[form4?.name ?? "Form 4", "GRADUATED", "Alumni"], ["No next-year enrollment"]]}
            />
            <ReviewGroup
              icon={RotateCcw}
              tone="warning"
              title="Retain in Form 4"
              count={counts.RETAIN}
              flow={[
                [form4?.name ?? "Form 4", "RETAINED"],
                [retainYear?.name ?? "Next year", retainClassName, "ACTIVE"],
              ]}
            />
          </div>
          <div className="flex justify-between">
            <Button variant="outline" icon={<ArrowLeft className="size-4" />} onClick={() => setStep(1)} disabled={running}>
              Back
            </Button>
            <Button icon={<CheckCircle2 className="size-4" />} loading={running} disabled={!canConfirm} onClick={confirmAll}>
              Confirm graduation
            </Button>
          </div>
        </>
      )}

      {step === 3 && run && (
        <div className="space-y-4">
          <Card>
            <div className="flex items-start gap-4">
              <span
                className={`flex size-11 shrink-0 items-center justify-center rounded-full ${run.sectionError ? "bg-warning-soft text-warning" : "bg-success-soft text-success"}`}
              >
                {run.sectionError ? <AlertTriangle className="size-6" /> : <GraduationCap className="size-6" />}
              </span>
              <div className="min-w-0">
                <h2 className="text-lg font-semibold text-foreground">
                  {run.sectionError ? "Graduation partly complete" : "Graduation complete"}
                </h2>
                <p className="mt-1 text-sm text-foreground-soft">
                  {run.graduated} student{run.graduated === 1 ? "" : "s"} graduated and joined the Alumni Directory
                  {run.retained > 0 ? `; ${run.retained} will repeat Form 4` : ""}.
                </p>
              </div>
            </div>
          </Card>
          {run.sectionError && (
            <Alert tone="danger">
              <p className="font-medium">Section {run.sectionError.sectionName} was not graduated.</p>
              <p className="mt-1">{run.sectionError.message}</p>
              <p className="mt-1">
                {run.sectionsDone.length > 0 ? `Sections ${run.sectionsDone.join(", ")} were saved. ` : ""}Nothing was changed for Section{" "}
                {run.sectionError.sectionName} or later sections — run the workflow again for them.
              </p>
            </Alert>
          )}
          <div className="flex flex-wrap gap-2">
            <Link href={`/schools/${schoolId}/alumni`}>
              <Button icon={<GraduationCap className="size-4" />}>View Alumni</Button>
            </Link>
            <Link href={`/schools/${schoolId}/promotions`}>
              <Button variant="outline" icon={<ArrowLeft className="size-4" />}>
                Back to Year-End Progression
              </Button>
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
