"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, ArrowLeft, CheckCircle2, Lock } from "lucide-react";
import { useAuth, ApiError } from "@/lib/auth-context";
import {
  api,
  type AcademicYear,
  type ClassWithSections,
  type Form1TransitionPreview,
  type Form1TransitionResult,
  type LifecycleEnrollmentRow,
} from "@/lib/api";
import { Card, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { Stepper } from "@/components/ui/Stepper";
import { Select, FormField } from "@/components/ui/FormControls";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { DataTable, type Column } from "@/components/ui/DataTable";

const STEPS = [{ label: "Select Students" }, { label: "Academic Year & Destination" }, { label: "Assign Sections" }, { label: "Review & Confirm" }];

export function Form1TransitionWizard({ schoolId, schoolName }: { schoolId: string; schoolName: string }) {
  const { accessToken } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [step, setStep] = useState(0);
  const [loadingCandidates, setLoadingCandidates] = useState(true);
  const [candidates, setCandidates] = useState<LifecycleEnrollmentRow[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [classes, setClasses] = useState<ClassWithSections[]>([]);
  const [academicYears, setAcademicYears] = useState<AcademicYear[]>([]);
  const [toClassId, setToClassId] = useState("");
  const [toAcademicYearId, setToAcademicYearId] = useState("");

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const [preview, setPreview] = useState<Form1TransitionPreview | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [assignments, setAssignments] = useState<Map<string, string>>(new Map());

  const [confirming, setConfirming] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [result, setResult] = useState<Form1TransitionResult | null>(null);

  // Load the pool of eligible (awaiting) students for this school, plus the
  // destination class/year options, once up front.
  useEffect(() => {
    if (!accessToken) return;
    Promise.all([
      api.listAwaitingEnrollment(accessToken, { schoolId, pageSize: 100 }),
      api.listClasses(accessToken, schoolId),
      api.listAcademicYears(accessToken, schoolId),
    ])
      .then(([awaiting, classList, years]) => {
        setCandidates(awaiting.data);
        setClasses(classList);
        setAcademicYears(years);

        const form1Classes = classList.filter((c) => c.division.type === "SECONDARY" && c.level === 1);
        if (form1Classes.length === 1) setToClassId(form1Classes[0].id);

        const initialIds = new Set<string>();
        const single = searchParams.get("enrollmentId");
        const many = searchParams.get("enrollmentIds");
        if (single) initialIds.add(single);
        if (many) many.split(",").forEach((id) => id && initialIds.add(id));
        if (initialIds.size > 0) setSelectedIds(initialIds);
      })
      .catch((err) => setLoadError(err instanceof ApiError ? err.message : "Failed to load Form 1 Transition data"))
      .finally(() => setLoadingCandidates(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken, schoolId]);

  const form1Classes = useMemo(() => classes.filter((c) => c.division.type === "SECONDARY" && c.level === 1), [classes]);

  async function runPreview() {
    if (!accessToken || !toClassId || !toAcademicYearId || selectedIds.size === 0) return;
    setPreviewing(true);
    setPreviewError(null);
    try {
      const p = await api.previewForm1Transition(accessToken, schoolId, {
        toClassId,
        toAcademicYearId,
        enrollmentIds: [...selectedIds],
      });
      setPreview(p);
      // Auto-fill: fill sections in order, respecting capacity, so the admin
      // starts from a sensible default and only has to adjust exceptions.
      const consumed = new Map(p.targetSections.map((s) => [s.id, s.currentActive]));
      const nextAssignments = new Map<string, string>();
      for (const student of p.eligible) {
        const section = p.targetSections.find((s) => {
          const used = consumed.get(s.id) ?? 0;
          return s.capacity === null || used < s.capacity;
        });
        if (section) {
          nextAssignments.set(student.enrollmentId, section.id);
          consumed.set(section.id, (consumed.get(section.id) ?? 0) + 1);
        }
      }
      setAssignments(nextAssignments);
      setStep(2);
    } catch (err) {
      setPreviewError(err instanceof ApiError ? err.message : "Failed to preview Form 1 Transition");
    } finally {
      setPreviewing(false);
    }
  }

  async function confirm() {
    if (!accessToken || !preview) return;
    setConfirming(true);
    setConfirmError(null);
    try {
      const assignmentList = preview.eligible
        .map((s) => ({ enrollmentId: s.enrollmentId, sectionId: assignments.get(s.enrollmentId) ?? "" }))
        .filter((a) => a.sectionId);
      const res = await api.confirmForm1Transition(accessToken, schoolId, { toClassId, toAcademicYearId, assignments: assignmentList });
      setResult(res);
      setStep(3);
    } catch (err) {
      setConfirmError(err instanceof ApiError ? err.message : "Failed to confirm Form 1 Transition");
    } finally {
      setConfirming(false);
    }
  }

  const toClass = classes.find((c) => c.id === toClassId);
  const toYear = academicYears.find((y) => y.id === toAcademicYearId);
  const allAssigned = preview ? preview.eligible.every((s) => assignments.has(s.enrollmentId)) : false;

  if (loadError) return <Alert tone="danger">{loadError}</Alert>;

  if (!loadingCandidates && form1Classes.length === 0) {
    return (
      <EmptyState
        icon={Lock}
        title="No Form 1 class found"
        description={`${schoolName} has no level-1 Secondary class to transition students into. Set up a Secondary division and Form 1 class first, or use Transfer for students moving to a different school.`}
      />
    );
  }

  return (
    <div className="space-y-5">
      <Stepper steps={STEPS} currentIndex={step} />

      {step === 0 && (
        <Card padding="none">
          <CardHeader
            title="Select students"
            description={`Students currently awaiting Form 1 enrollment at ${schoolName}.`}
          />
          <div className="p-5">
            {loadingCandidates ? (
              <p className="text-sm text-foreground-soft">Loading…</p>
            ) : candidates.length === 0 ? (
              <EmptyState title="No students awaiting enrollment" description="Every completed Primary student here has already moved on." />
            ) : (
              <DataTable
                data={candidates}
                rowKey={(r) => r.enrollmentId}
                searchPlaceholder="Search by name or student ID…"
                searchFilter={(r, q) =>
                  `${r.firstName} ${r.lastName} ${r.studentNumber}`.toLowerCase().includes(q)
                }
                pagination={{ pageSizeOptions: [10, 25, 50, 100], defaultPageSize: 25, itemLabel: "students" }}
                columns={studentColumns}
                selection={{
                  selectedKeys: selectedIds,
                  onToggle: (key, checked) =>
                    setSelectedIds((prev) => {
                      const next = new Set(prev);
                      if (checked) next.add(key);
                      else next.delete(key);
                      return next;
                    }),
                  onToggleAll: (keys, checked) =>
                    setSelectedIds((prev) => {
                      const next = new Set(prev);
                      keys.forEach((k) => (checked ? next.add(k) : next.delete(k)));
                      return next;
                    }),
                }}
              />
            )}
          </div>
          <div className="flex justify-end border-t border-border p-5">
            <Button icon={<ArrowRight className="size-4" />} disabled={selectedIds.size === 0} onClick={() => setStep(1)}>
              Next — {selectedIds.size} selected
            </Button>
          </div>
        </Card>
      )}

      {step === 1 && (
        <Card padding="none">
          <CardHeader title="Academic year & destination" description="Form 1 Transition always stays within the same school — moving to a different school's Secondary division is a Transfer instead." />
          <div className="space-y-4 p-5">
            <div className="rounded-lg border border-border bg-surface-soft p-3 text-sm text-foreground-soft">
              Destination: <span className="font-medium text-foreground">{schoolName}</span> → Secondary Division
            </div>
            {form1Classes.length > 1 && (
              <FormField label="Form 1 class" required>
                <Select value={toClassId} onChange={(e) => setToClassId(e.target.value)}>
                  <option value="">Select…</option>
                  {form1Classes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </FormField>
            )}
            {form1Classes.length === 1 && (
              <p className="text-sm text-foreground-soft">
                Class: <span className="font-medium text-foreground">{form1Classes[0].name}</span>
              </p>
            )}
            <FormField label="Destination academic year" required hint="The year these students will start Form 1 in.">
              <Select value={toAcademicYearId} onChange={(e) => setToAcademicYearId(e.target.value)}>
                <option value="">Select…</option>
                {academicYears.map((y) => (
                  <option key={y.id} value={y.id}>
                    {y.name}
                    {y.isCurrent ? " (current)" : ""}
                  </option>
                ))}
              </Select>
            </FormField>
            {previewError && <Alert tone="danger">{previewError}</Alert>}
          </div>
          <div className="flex justify-between border-t border-border p-5">
            <Button variant="outline" icon={<ArrowLeft className="size-4" />} onClick={() => setStep(0)}>
              Back
            </Button>
            <Button
              icon={<ArrowRight className="size-4" />}
              loading={previewing}
              disabled={!toClassId || !toAcademicYearId}
              onClick={runPreview}
            >
              Preview
            </Button>
          </div>
        </Card>
      )}

      {step === 2 && preview && (
        <Card padding="none">
          <CardHeader
            title="Assign sections"
            description={`${preview.eligible.length} eligible · ${preview.ineligible.length} excluded`}
          />
          <div className="space-y-4 p-5">
            {preview.ineligible.length > 0 && (
              <Alert tone="warning">
                <p className="font-medium">{preview.ineligible.length} student(s) excluded automatically:</p>
                <ul className="mt-1 list-inside list-disc">
                  {preview.ineligible.map((s) => {
                    const c = candidates.find((x) => x.enrollmentId === s.enrollmentId);
                    return (
                      <li key={s.enrollmentId}>
                        {c ? `${c.firstName} ${c.lastName}` : s.enrollmentId} — {s.reason}
                      </li>
                    );
                  })}
                </ul>
              </Alert>
            )}

            {preview.eligible.length === 0 ? (
              <EmptyState title="No eligible students to assign" description="Every selected student was excluded above." />
            ) : (
              <div className="overflow-x-auto rounded-xl border border-border">
                <table className="w-full min-w-[520px] text-left text-sm">
                  <thead className="bg-surface-soft text-xs font-semibold uppercase tracking-wide text-foreground-muted">
                    <tr>
                      <th className="px-4 py-2.5">Student</th>
                      <th className="px-4 py-2.5">Roll #</th>
                      <th className="px-4 py-2.5">Section</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {preview.eligible.map((s) => (
                      <tr key={s.enrollmentId}>
                        <td className="px-4 py-3 text-foreground">
                          {s.firstName} {s.lastName} <span className="text-foreground-muted">#{s.studentNumber}</span>
                        </td>
                        <td className="px-4 py-3 text-foreground-soft">{s.rollNumber}</td>
                        <td className="px-4 py-3">
                          <Select
                            value={assignments.get(s.enrollmentId) ?? ""}
                            onChange={(e) =>
                              setAssignments((prev) => new Map(prev).set(s.enrollmentId, e.target.value))
                            }
                            className="w-48"
                          >
                            <option value="">Select section…</option>
                            {preview.targetSections.map((sec) => (
                              <option key={sec.id} value={sec.id}>
                                {sec.name} — {sec.available === null ? "Unlimited" : `${sec.available} available`}
                              </option>
                            ))}
                          </Select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          <div className="flex justify-between border-t border-border p-5">
            <Button variant="outline" icon={<ArrowLeft className="size-4" />} onClick={() => setStep(1)}>
              Back
            </Button>
            <Button icon={<ArrowRight className="size-4" />} disabled={!allAssigned || preview.eligible.length === 0} onClick={() => setStep(3)}>
              Review
            </Button>
          </div>
        </Card>
      )}

      {step === 3 && preview && !result && (
        <Card padding="none">
          <CardHeader title="Review & confirm" description="This creates a new active Form 1 enrollment for each student below. Their Primary enrollment record is preserved exactly as-is." />
          <div className="p-5">
            <div className="mb-4 flex flex-wrap gap-2 text-sm text-foreground-soft">
              <Badge tone="accent">{toClass?.name ?? "Form 1"}</Badge>
              <Badge tone="accent">{toYear?.name}</Badge>
              <Badge>{preview.eligible.length} student(s)</Badge>
            </div>
            <div className="flex flex-wrap gap-2">
              {preview.eligible.map((s) => {
                const sectionName = preview.targetSections.find((sec) => sec.id === assignments.get(s.enrollmentId))?.name;
                return (
                  <Badge key={s.enrollmentId} tone="neutral">
                    {s.firstName} {s.lastName} → {sectionName ?? "—"}
                  </Badge>
                );
              })}
            </div>
            {confirmError && (
              <Alert tone="danger" className="mt-4">
                {confirmError}
              </Alert>
            )}
          </div>
          <div className="flex justify-between border-t border-border p-5">
            <Button variant="outline" icon={<ArrowLeft className="size-4" />} onClick={() => setStep(2)}>
              Back
            </Button>
            <Button icon={<CheckCircle2 className="size-4" />} loading={confirming} onClick={confirm}>
              Confirm Form 1 Transition
            </Button>
          </div>
        </Card>
      )}

      {result && (
        <Alert tone="success">
          <p className="font-medium">Form 1 Transition confirmed — {result.results.length} student(s) enrolled.</p>
          <div className="mt-3 flex gap-2">
            <Button size="sm" variant="outline" onClick={() => router.push(`/schools/${schoolId}/student-lifecycle/awaiting-enrollment`)}>
              View Awaiting Enrollment
            </Button>
            <Button size="sm" variant="outline" onClick={() => router.push(`/schools/${schoolId}/students`)}>
              View Students
            </Button>
          </div>
        </Alert>
      )}
    </div>
  );
}

const studentColumns: Column<LifecycleEnrollmentRow>[] = [
  { key: "student", header: "Student", render: (r) => `${r.firstName} ${r.lastName}`, sortValue: (r) => `${r.firstName} ${r.lastName}` },
  { key: "studentNumber", header: "Student ID", render: (r) => r.studentNumber },
  { key: "class", header: "Previous Class", render: (r) => `${r.class.name} · ${r.section.name}` },
  { key: "year", header: "Academic Year", render: (r) => r.academicYear.name },
  { key: "rollNumber", header: "Roll #", render: (r) => r.rollNumber, sortValue: (r) => r.rollNumber },
];
