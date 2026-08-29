"use client";

import { useEffect, useState } from "react";
import { ArrowUpCircle, CheckCircle2 } from "lucide-react";
import { ApiError, useAuth } from "@/lib/auth-context";
import { api, type AcademicYear, type ClassWithSections, type PromotionPreview } from "@/lib/api";
import { Card, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { FormField, Select } from "@/components/ui/FormControls";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";

const OUTCOME_LABEL: Record<PromotionPreview["outcome"], string> = {
  PROMOTED: "Will be promoted",
  COMPLETED: "Will complete this division",
  GRADUATED: "Will graduate",
};

export function PromotionWizard({ schoolId }: { schoolId: string }) {
  const { accessToken } = useAuth();

  const [years, setYears] = useState<AcademicYear[]>([]);
  const [classes, setClasses] = useState<ClassWithSections[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [classId, setClassId] = useState("");
  const [sectionId, setSectionId] = useState("");
  const [fromYearId, setFromYearId] = useState("");
  const [toYearId, setToYearId] = useState("");
  const [targetSectionId, setTargetSectionId] = useState("");

  const [preview, setPreview] = useState<PromotionPreview | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<number | null>(null);

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

  async function onPreview() {
    if (!accessToken || !sectionId || !fromYearId) return;
    setError(null);
    setDone(null);
    setPreview(null);
    setPreviewing(true);
    try {
      const result = await api.previewPromotion(accessToken, schoolId, sectionId, fromYearId);
      setPreview(result);
      if (result.targetSections[0]) setTargetSectionId(result.targetSections[0].id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to preview promotion");
    } finally {
      setPreviewing(false);
    }
  }

  async function onConfirm() {
    if (!accessToken || !preview || !toYearId) return;
    setError(null);
    setConfirming(true);
    try {
      const result = await api.confirmPromotion(accessToken, schoolId, sectionId, {
        fromAcademicYearId: fromYearId,
        toAcademicYearId: toYearId,
        targetSectionId: preview.outcome === "PROMOTED" ? targetSectionId : undefined,
      });
      setDone(result.items.length);
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

      {done !== null && (
        <Alert tone="success">
          Promotion confirmed — {done} student{done === 1 ? "" : "s"} updated.
        </Alert>
      )}

      {preview && (
        <Card padding="none">
          <CardHeader
            title={OUTCOME_LABEL[preview.outcome]}
            description={`${preview.currentClass.name}${preview.nextClass ? ` → ${preview.nextClass.name}` : ""}`}
          />
          <div className="p-5">
            {preview.students.length === 0 ? (
              <EmptyState title="No active students" description="Nothing to promote in this section for that year." />
            ) : (
              <>
                <div className="flex flex-wrap gap-2">
                  {preview.students.map((s) => (
                    <Badge key={s.studentId}>
                      #{s.rollNumber} {s.firstName} {s.lastName}
                    </Badge>
                  ))}
                </div>

                <div className="mt-5 grid grid-cols-1 gap-4 border-t border-border pt-5 sm:grid-cols-2">
                  <FormField label="To academic year" required>
                    <Select required value={toYearId} onChange={(e) => setToYearId(e.target.value)}>
                      <option value="">Select…</option>
                      {years
                        .filter((y) => y.id !== fromYearId)
                        .map((y) => (
                          <option key={y.id} value={y.id}>
                            {y.name}
                          </option>
                        ))}
                    </Select>
                  </FormField>

                  {preview.outcome === "PROMOTED" && (
                    <FormField label="Target section" required>
                      <Select required value={targetSectionId} onChange={(e) => setTargetSectionId(e.target.value)}>
                        {preview.targetSections.map((s) => (
                          <option key={s.id} value={s.id} disabled={s.available < preview.students.length}>
                            {s.name} — {s.available}/{s.capacity} available
                          </option>
                        ))}
                      </Select>
                    </FormField>
                  )}
                </div>

                <Button
                  className="mt-4"
                  icon={<CheckCircle2 className="size-4" />}
                  loading={confirming}
                  disabled={!toYearId || (preview.outcome === "PROMOTED" && !targetSectionId)}
                  onClick={onConfirm}
                >
                  Confirm {OUTCOME_LABEL[preview.outcome].toLowerCase()}
                </Button>
              </>
            )}
          </div>
        </Card>
      )}
    </div>
  );
}
