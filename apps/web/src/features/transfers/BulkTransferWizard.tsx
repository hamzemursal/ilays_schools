"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, ArrowLeft, CheckCircle2, X } from "lucide-react";
import { useAuth, ApiError } from "@/lib/auth-context";
import {
  api,
  type AcademicYear,
  type BulkTransferPreview,
  type BulkTransferResult,
  type ClassWithSections,
  type StudentListItem,
} from "@/lib/api";
import { Card, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { Stepper } from "@/components/ui/Stepper";
import { Select, FormField, Textarea } from "@/components/ui/FormControls";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";

const STEPS = [{ label: "Selected Students" }, { label: "Destination" }, { label: "Assign Sections" }, { label: "Review & Confirm" }];

// Only reachable when the actor has access to both schools — see
// TransfersService.previewBulkTransfer/confirmBulkTransfer. An admin who
// only manages the origin school gets a clean 404 from the API the moment
// they pick a destination they don't have access to; there's no separate
// permission check needed here since the backend already enforces it.
export function BulkTransferWizard({
  schoolId,
  schoolName,
  studentIds,
}: {
  schoolId: string;
  schoolName: string;
  studentIds: string[];
}) {
  const { user, accessToken } = useAuth();
  const router = useRouter();

  const [step, setStep] = useState(0);
  const [loadingStudents, setLoadingStudents] = useState(true);
  const [selectedStudents, setSelectedStudents] = useState<StudentListItem[]>([]);
  const [removedIds, setRemovedIds] = useState<Set<string>>(new Set());
  const [loadError, setLoadError] = useState<string | null>(null);

  const [schools, setSchools] = useState<{ id: string; name: string }[]>([]);
  const [toSchoolId, setToSchoolId] = useState("");
  const [years, setYears] = useState<AcademicYear[]>([]);
  const [classes, setClasses] = useState<ClassWithSections[]>([]);
  const [toAcademicYearId, setToAcademicYearId] = useState("");
  const [toClassId, setToClassId] = useState("");

  const [preview, setPreview] = useState<BulkTransferPreview | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [assignments, setAssignments] = useState<Map<string, string>>(new Map());

  const [reason, setReason] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [result, setResult] = useState<BulkTransferResult | null>(null);

  useEffect(() => {
    if (!accessToken) return;
    // Destination options are "schools this actor can reach", not "every
    // school in the org" — api.listSchools() needs schools.view, which a
    // plain School Admin doesn't hold even when assigned to several
    // schools. Their own profile (user.schools) already lists exactly
    // those schools with no extra permission required; only an actor with
    // schools.view (Super/Org Admin) falls back to the full directory,
    // since their own assigned-schools list can be empty.
    const loadSchools = user?.permissions.includes("schools.view")
      ? api.listSchools(accessToken).then((list) => list.map((s) => ({ id: s.id, name: s.name })))
      : Promise.resolve((user?.schools ?? []).map((s) => ({ id: s.id, name: s.name })));
    Promise.all([api.listStudents(accessToken, schoolId), loadSchools])
      .then(([all, schoolList]) => {
        setSelectedStudents(all.filter((s) => studentIds.includes(s.studentId)));
        setSchools(schoolList.filter((s) => s.id !== schoolId));
      })
      .catch((err) => setLoadError(err instanceof ApiError ? err.message : "Failed to load selected students"))
      .finally(() => setLoadingStudents(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken, schoolId]);

  // A new (or cleared) destination school invalidates the previous one's
  // year/class options — reset during render (React's own recommended
  // pattern for "adjust state when a value changes") rather than
  // synchronously inside the effect below, which only ever calls setState
  // from its async .then()/.catch() callbacks.
  const [prevToSchoolId, setPrevToSchoolId] = useState(toSchoolId);
  if (toSchoolId !== prevToSchoolId) {
    setPrevToSchoolId(toSchoolId);
    if (!toSchoolId) {
      setYears([]);
      setClasses([]);
    }
  }

  useEffect(() => {
    if (!accessToken || !toSchoolId) return;
    Promise.all([api.listAcademicYears(accessToken, toSchoolId), api.listClasses(accessToken, toSchoolId)])
      .then(([y, c]) => {
        setYears(y);
        setClasses(c);
        const current = y.find((yr) => yr.isCurrent) ?? y[0];
        if (current) setToAcademicYearId(current.id);
      })
      .catch(() => {
        setYears([]);
        setClasses([]);
      });
  }, [accessToken, toSchoolId]);

  const activeStudents = selectedStudents.filter((s) => !removedIds.has(s.studentId));
  const toClass = classes.find((c) => c.id === toClassId);

  async function runPreview() {
    if (!accessToken || !toSchoolId || activeStudents.length === 0) return;
    setPreviewing(true);
    setPreviewError(null);
    try {
      const p = await api.previewBulkTransfer(accessToken, schoolId, {
        toSchoolId,
        studentIds: activeStudents.map((s) => s.studentId),
      });
      setPreview(p);

      const sectionCapacity = new Map(toClass?.sections.map((s) => [s.id, { capacity: s.capacity, used: s._count.enrollments }]) ?? []);
      const nextAssignments = new Map<string, string>();
      for (const student of p.eligible) {
        const section = toClass?.sections.find((s) => {
          const info = sectionCapacity.get(s.id);
          return !info || info.capacity === null || info.used < info.capacity;
        });
        if (section) {
          nextAssignments.set(student.studentId, section.id);
          const info = sectionCapacity.get(section.id);
          if (info) info.used += 1;
        }
      }
      setAssignments(nextAssignments);
      setStep(2);
    } catch (err) {
      setPreviewError(err instanceof ApiError ? err.message : "Failed to preview bulk transfer");
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
        .map((s) => ({ studentId: s.studentId, sectionId: assignments.get(s.studentId) ?? "" }))
        .filter((a) => a.sectionId);
      const res = await api.confirmBulkTransfer(accessToken, schoolId, {
        toSchoolId,
        toAcademicYearId,
        toClassId,
        reason: reason || undefined,
        assignments: assignmentList,
      });
      setResult(res);
      setStep(3);
    } catch (err) {
      setConfirmError(err instanceof ApiError ? err.message : "Failed to confirm bulk transfer");
    } finally {
      setConfirming(false);
    }
  }

  const toSchool = schools.find((s) => s.id === toSchoolId);
  const toYear = years.find((y) => y.id === toAcademicYearId);
  const allAssigned = preview ? preview.eligible.every((s) => assignments.has(s.studentId)) : false;

  if (loadError) return <Alert tone="danger">{loadError}</Alert>;

  return (
    <div className="space-y-5">
      <Stepper steps={STEPS} currentIndex={step} />

      {step === 0 && (
        <Card padding="none">
          <CardHeader title="Selected students" description={`${activeStudents.length} student(s) from ${schoolName}, selected from the Students list.`} />
          <div className="p-5">
            {loadingStudents ? (
              <p className="text-sm text-foreground-soft">Loading…</p>
            ) : activeStudents.length === 0 ? (
              <EmptyState title="No students left" description="Every selected student was removed. Go back and select students again." />
            ) : (
              <ul className="divide-y divide-border">
                {activeStudents.map((s) => (
                  <li key={s.studentId} className="flex items-center justify-between gap-3 py-2">
                    <span className="text-sm text-foreground">
                      {s.firstName} {s.lastName} <span className="text-foreground-muted">#{s.studentNumber}</span>{" "}
                      <span className="text-foreground-muted">
                        · {s.className} · {s.sectionName}
                      </span>
                    </span>
                    <button
                      type="button"
                      onClick={() => setRemovedIds((prev) => new Set(prev).add(s.studentId))}
                      aria-label={`Remove ${s.firstName}`}
                      className="flex size-6 shrink-0 items-center justify-center rounded-full text-foreground-muted hover:bg-surface-hover hover:text-foreground"
                    >
                      <X className="size-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="flex justify-end border-t border-border p-5">
            <Button icon={<ArrowRight className="size-4" />} disabled={activeStudents.length === 0} onClick={() => setStep(1)}>
              Next
            </Button>
          </div>
        </Card>
      )}

      {step === 1 && (
        <Card padding="none">
          <CardHeader title="Destination" description="Choose the school, academic year, and class these students will join." />
          <div className="space-y-4 p-5">
            <FormField label="Destination school" required hint="Only schools you have access to can complete a bulk transfer in one step.">
              <Select value={toSchoolId} onChange={(e) => { setToSchoolId(e.target.value); setToClassId(""); }}>
                <option value="">Select…</option>
                {schools.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </FormField>
            {toSchoolId && (
              <>
                <FormField label="Academic year" required>
                  <Select value={toAcademicYearId} onChange={(e) => setToAcademicYearId(e.target.value)}>
                    <option value="">Select…</option>
                    {years.map((y) => (
                      <option key={y.id} value={y.id}>
                        {y.name}
                        {y.isCurrent ? " (current)" : ""}
                      </option>
                    ))}
                  </Select>
                </FormField>
                <FormField label="Class" required>
                  <Select value={toClassId} onChange={(e) => setToClassId(e.target.value)}>
                    <option value="">Select…</option>
                    {classes.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </Select>
                </FormField>
              </>
            )}
            {previewError && <Alert tone="danger">{previewError}</Alert>}
          </div>
          <div className="flex justify-between border-t border-border p-5">
            <Button variant="outline" icon={<ArrowLeft className="size-4" />} onClick={() => setStep(0)}>
              Back
            </Button>
            <Button
              icon={<ArrowRight className="size-4" />}
              loading={previewing}
              disabled={!toSchoolId || !toAcademicYearId || !toClassId}
              onClick={runPreview}
            >
              Preview
            </Button>
          </div>
        </Card>
      )}

      {step === 2 && preview && (
        <Card padding="none">
          <CardHeader title="Assign sections" description={`${preview.eligible.length} eligible · ${preview.ineligible.length} excluded`} />
          <div className="space-y-4 p-5">
            {preview.ineligible.length > 0 && (
              <Alert tone="warning">
                <p className="font-medium">{preview.ineligible.length} student(s) excluded automatically:</p>
                <ul className="mt-1 list-inside list-disc">
                  {preview.ineligible.map((s) => {
                    const student = activeStudents.find((x) => x.studentId === s.studentId);
                    return (
                      <li key={s.studentId}>
                        {student ? `${student.firstName} ${student.lastName}` : s.studentId} — {s.reason}
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
                      <th className="px-4 py-2.5">From</th>
                      <th className="px-4 py-2.5">Section</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {preview.eligible.map((s) => (
                      <tr key={s.studentId}>
                        <td className="px-4 py-3 text-foreground">
                          {s.firstName} {s.lastName} <span className="text-foreground-muted">#{s.studentNumber}</span>
                        </td>
                        <td className="px-4 py-3 text-foreground-soft">
                          {s.fromClass} · {s.fromSection}
                        </td>
                        <td className="px-4 py-3">
                          <Select
                            value={assignments.get(s.studentId) ?? ""}
                            onChange={(e) => setAssignments((prev) => new Map(prev).set(s.studentId, e.target.value))}
                            className="w-48"
                          >
                            <option value="">Select section…</option>
                            {toClass?.sections.map((sec) => (
                              <option key={sec.id} value={sec.id}>
                                {sec.name} {sec.capacity !== null ? `— capacity ${sec.capacity}` : "— Unlimited"}
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
          <CardHeader
            title="Review & confirm"
            description="This creates a new active enrollment for each student below and completes the transfer immediately — no separate approval step, since you have access to both schools."
          />
          <div className="p-5">
            <div className="mb-4 flex flex-wrap gap-2 text-sm text-foreground-soft">
              <Badge tone="accent">{schoolName}</Badge>
              <ArrowRight className="size-4 self-center" />
              <Badge tone="accent">{toSchool?.name}</Badge>
              <Badge tone="accent">{toClass?.name}</Badge>
              <Badge tone="accent">{toYear?.name}</Badge>
              <Badge>{preview.eligible.length} student(s)</Badge>
            </div>
            <div className="flex flex-wrap gap-2">
              {preview.eligible.map((s) => {
                const sectionName = toClass?.sections.find((sec) => sec.id === assignments.get(s.studentId))?.name;
                return (
                  <Badge key={s.studentId} tone="neutral">
                    {s.firstName} {s.lastName} → {sectionName ?? "—"}
                  </Badge>
                );
              })}
            </div>
            <FormField label="Reason (optional)" className="mt-4">
              <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} placeholder="e.g. Whole-section relocation" />
            </FormField>
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
              Confirm Bulk Transfer
            </Button>
          </div>
        </Card>
      )}

      {result && (
        <Alert tone="success">
          <p className="font-medium">Bulk transfer confirmed — {result.results.length} student(s) enrolled at {toSchool?.name}.</p>
          <div className="mt-3 flex gap-2">
            <Button size="sm" variant="outline" onClick={() => router.push(`/schools/${schoolId}/transfers/outgoing`)}>
              View Outgoing Transfers
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
