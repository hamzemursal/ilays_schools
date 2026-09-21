"use client";

import { useEffect, useState } from "react";
import { ArrowUpCircle, CheckCircle2 } from "lucide-react";
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
import { EmptyState } from "@/components/ui/EmptyState";

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
  const [outcomes, setOutcomes] = useState<Map<string, PromotionOutcome | "">>(new Map());
  const [destinations, setDestinations] = useState<Map<string, string>>(new Map());
  const [previewing, setPreviewing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmedCount, setConfirmedCount] = useState<number | null>(null);

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

  // Auto-fills a starting destination for every student already assigned an
  // outcome, respecting real capacity — the Admin reviews and can override
  // any single one afterward, but starts from a sensible default instead of
  // an empty grid of selects for every row.
  function autoFillDestinations(students: PromotionStudentRow[], outcomeFor: Map<string, PromotionOutcome | "">, sections: {
    PROMOTED_OR_NATURAL: PromotionSectionOption[];
    RETAINED: PromotionSectionOption[];
  }): Map<string, string> {
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

  async function onPreview() {
    if (!accessToken || !sectionId || !fromYearId) return;
    setError(null);
    setConfirmedCount(null);
    setPreview(null);
    setPreviewing(true);
    try {
      const result = await api.previewPromotion(accessToken, schoolId, sectionId, fromYearId);
      setPreview(result);
      const initialOutcomes = new Map<string, PromotionOutcome | "">(
        result.students.map((s) => [s.enrollmentId, s.suggestedOutcome ?? ""]),
      );
      setOutcomes(initialOutcomes);
      setDestinations(
        autoFillDestinations(result.students, initialOutcomes, {
          PROMOTED_OR_NATURAL: result.nextClassSections,
          RETAINED: result.currentClassSections,
        }),
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to preview promotion");
    } finally {
      setPreviewing(false);
    }
  }

  function setOutcomeFor(enrollmentId: string, outcome: PromotionOutcome | "") {
    setOutcomes((prev) => new Map(prev).set(enrollmentId, outcome));
    // A destination picked for the previous outcome is almost never valid
    // for the new one (PROMOTED targets the next class, RETAINED the
    // current one) — clearing it forces a deliberate re-pick instead of
    // silently submitting a stale section.
    setDestinations((prev) => {
      const next = new Map(prev);
      next.delete(enrollmentId);
      return next;
    });
  }

  const needsDestination = (outcome: PromotionOutcome | "") => outcome === "PROMOTED" || outcome === "RETAINED";

  // Promotion only ever moves students INTO an academic year the Admin has
  // already created, and only a later one than the year being promoted from.
  const fromYear = years.find((y) => y.id === fromYearId);
  const laterYears = fromYear ? years.filter((y) => new Date(y.startDate) > new Date(fromYear.startDate)) : [];

  const allDecided = preview
    ? preview.students.every((s) => {
        const outcome = outcomes.get(s.enrollmentId) ?? "";
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
        const outcome = outcomes.get(s.enrollmentId) as PromotionOutcome;
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
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to confirm promotion");
    } finally {
      setConfirming(false);
    }
  }

  if (loadError) return <Alert tone="danger">{loadError}</Alert>;

  return (
    <div className="space-y-5">
      <Card>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-foreground-muted">Select a section</h2>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <FormField label="Class">
            <Select
              value={classId}
              onChange={(e) => {
                setClassId(e.target.value);
                const c = classes.find((cl) => cl.id === e.target.value);
                setSectionId(c?.sections[0]?.id ?? "");
                setPreview(null);
              }}
            >
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Section">
            <Select
              value={sectionId}
              onChange={(e) => {
                setSectionId(e.target.value);
                setPreview(null);
              }}
            >
              {selectedClass?.sections.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="From academic year">
            <Select
              value={fromYearId}
              onChange={(e) => {
                setFromYearId(e.target.value);
                setToYearId("");
                setPreview(null);
              }}
            >
              {years.map((y) => (
                <option key={y.id} value={y.id}>
                  {y.name}
                </option>
              ))}
            </Select>
          </FormField>
        </div>
        <Button className="mt-4" icon={<ArrowUpCircle className="size-4" />} loading={previewing} onClick={onPreview}>
          Preview
        </Button>
      </Card>

      {error && <Alert tone="danger">{error}</Alert>}

      {confirmedCount !== null && (
        <Alert tone="success">
          Promotion confirmed — {confirmedCount} student{confirmedCount === 1 ? "" : "s"} updated.
        </Alert>
      )}

      {preview && (
        <Card padding="none">
          <CardHeader
            title={`This section's natural outcome: ${NATURAL_OUTCOME_LABEL[preview.naturalOutcome]}`}
            description={`${preview.currentClass.name}${preview.nextClass ? ` → ${preview.nextClass.name}` : ""} — review every student below; Incomplete students need a manual decision.`}
          />
          <div className="p-5">
            {preview.students.length === 0 ? (
              <EmptyState title="No active students" description="Nothing to promote in this section for that year." />
            ) : (
              <>
                <div className="overflow-x-auto rounded-xl border border-border">
                  <table className="w-full min-w-[1100px] text-left text-sm">
                    <thead className="bg-surface-soft text-xs font-semibold uppercase tracking-wide text-foreground-muted">
                      <tr>
                        <th className="px-4 py-2.5">Student</th>
                        <th className="px-4 py-2.5">Student ID</th>
                        <th className="px-4 py-2.5">Current Class/Section</th>
                        <th className="px-4 py-2.5">Term 1</th>
                        <th className="px-4 py-2.5">Term 2</th>
                        <th className="px-4 py-2.5">Annual Result</th>
                        <th className="px-4 py-2.5">Eligibility</th>
                        <th className="px-4 py-2.5">Outcome</th>
                        <th className="px-4 py-2.5">Destination</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {preview.students.map((s) => {
                        const outcome = outcomes.get(s.enrollmentId) ?? "";
                        const destinationPool = outcome === "PROMOTED" ? preview.nextClassSections : preview.currentClassSections;
                        return (
                          <tr key={s.enrollmentId}>
                            <td className="px-4 py-3 text-foreground">
                              {s.firstName} {s.lastName}
                            </td>
                            <td className="px-4 py-3 text-foreground-soft">{s.studentNumber}</td>
                            <td className="px-4 py-3 text-foreground-soft">
                              {preview.currentClass.name} · #{s.rollNumber}
                            </td>
                            <td className="px-4 py-3 text-foreground-soft">{formatPercent(s.term1Percentage)}</td>
                            <td className="px-4 py-3 text-foreground-soft">{formatPercent(s.term2Percentage)}</td>
                            <td className="px-4 py-3 font-medium text-foreground">{formatPercent(s.annualPercentage)}</td>
                            <td className="px-4 py-3">
                              <EligibilityBadge eligible={s.eligible} />
                            </td>
                            <td className="px-4 py-3">
                              <Select
                                value={outcome}
                                onChange={(e) => setOutcomeFor(s.enrollmentId, e.target.value as PromotionOutcome | "")}
                                className="w-40"
                                aria-label={`Outcome for ${s.firstName} ${s.lastName}`}
                              >
                                <option value="">Review…</option>
                                <option value={preview.naturalOutcome} disabled={s.eligible === false}>
                                  {NATURAL_OUTCOME_LABEL[preview.naturalOutcome]}
                                </option>
                                <option value="RETAINED">Retain</option>
                              </Select>
                            </td>
                            <td className="px-4 py-3">
                              {needsDestination(outcome) ? (
                                <Select
                                  value={destinations.get(s.enrollmentId) ?? ""}
                                  onChange={(e) =>
                                    setDestinations((prev) => new Map(prev).set(s.enrollmentId, e.target.value))
                                  }
                                  className="w-44"
                                  aria-label={`Destination section for ${s.firstName} ${s.lastName}`}
                                >
                                  <option value="">Select…</option>
                                  {destinationPool.map((sec) => (
                                    <option key={sec.id} value={sec.id}>
                                      {sec.name} — {sec.available === null ? "Unlimited" : `${sec.available} available`}
                                    </option>
                                  ))}
                                </Select>
                              ) : (
                                <span className="text-foreground-muted">—</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="mt-5 grid grid-cols-1 gap-4 border-t border-border pt-5 sm:grid-cols-2">
                  <FormField label="To academic year" htmlFor="toAcademicYearId" required>
                    <Select id="toAcademicYearId" required value={toYearId} onChange={(e) => setToYearId(e.target.value)}>
                      <option value="">Select…</option>
                      {laterYears.map((y) => (
                        <option key={y.id} value={y.id}>
                          {y.name}
                        </option>
                      ))}
                    </Select>
                  </FormField>
                </div>
                {laterYears.length === 0 && (
                  <Alert tone="warning" className="mt-4">
                    There is no academic year after {fromYear?.name ?? "this one"} yet. Create the new academic year first
                    (Academic → Years) and prepare its classes and sections — Promotion never creates an academic year for you.
                  </Alert>
                )}

                <Button
                  className="mt-4"
                  icon={<CheckCircle2 className="size-4" />}
                  loading={confirming}
                  disabled={!toYearId || !laterYears.some((y) => y.id === toYearId) || !allDecided}
                  onClick={onConfirm}
                >
                  Confirm promotion
                </Button>
                {!allDecided && (
                  <p className="mt-2 text-sm text-foreground-muted">
                    Every student needs an outcome — and a destination section for Promote/Retain — before you can confirm.
                  </p>
                )}
              </>
            )}
          </div>
        </Card>
      )}
    </div>
  );
}
