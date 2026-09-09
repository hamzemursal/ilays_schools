"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, CheckCircle2, Loader2 } from "lucide-react";
import { ApiError, useAuth } from "@/lib/auth-context";
import { api, type AcademicYear, type ClassWithSections, type Exam, type Subject } from "@/lib/api";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { Stepper } from "@/components/ui/Stepper";
import { useToast } from "@/components/ui/Toast";
import { BasicInfoStep, isBasicInfoValid } from "./steps/BasicInfoStep";
import { ClassesSubjectsStep, isClassesSubjectsValid } from "./steps/ClassesSubjectsStep";
import { SettingsStep, isSettingsValid } from "./steps/SettingsStep";
import { ReviewStep } from "./steps/ReviewStep";
import { emptyExamWizardState, EXAM_WIZARD_STEPS } from "./types";

export function ExamWizard({ schoolId }: { schoolId: string }) {
  const router = useRouter();
  const { accessToken } = useAuth();
  const { show } = useToast();

  const [years, setYears] = useState<AcademicYear[]>([]);
  const [classes, setClasses] = useState<ClassWithSections[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [step, setStep] = useState(0);
  const [state, setState] = useState(emptyExamWizardState(""));
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [created, setCreated] = useState<Exam | null>(null);

  useEffect(() => {
    if (!accessToken) return;
    Promise.all([
      api.listAcademicYears(accessToken, schoolId),
      api.listClasses(accessToken, schoolId),
      api.listSubjects(accessToken, schoolId),
    ])
      .then(([y, c, s]) => {
        setYears(y);
        setClasses(c);
        setSubjects(s);
        const current = y.find((year) => year.isCurrent) ?? y[0];
        if (current) setState((prev) => ({ ...prev, academicYearId: prev.academicYearId || current.id }));
      })
      .catch((err) => setLoadError(err instanceof ApiError ? err.message : "Failed to load form data"));
  }, [accessToken, schoolId]);

  function patch(p: Partial<typeof state>) {
    setState((prev) => ({ ...prev, ...p }));
  }

  const canProceed =
    step === 0 ? isBasicInfoValid(state, years) : step === 1 ? isClassesSubjectsValid(state) : step === 2 ? isSettingsValid(state) : true;

  async function submit() {
    if (!accessToken) return;
    setSubmitError(null);
    setSubmitting(true);
    try {
      // The checkbox list shows the *union* of subjects across every
      // selected class (Class 10's History alongside Class 5's Mathematics),
      // so a plain cross-product of selectedClassIds × selectedSubjectIds
      // would create pairs that were never real ClassSubject relationships
      // (Class 10 × Mathematics). Re-fetching each class's own subjects
      // right before submit — rather than trusting whatever
      // ClassesSubjectsStep last merged — keeps this correct even if
      // ClassSubject rows changed while the admin was still on this page,
      // and the backend re-validates every pair again regardless.
      const perClassSubjects = await Promise.all(
        Array.from(state.selectedClassIds).map((classId) => api.listClassSubjects(accessToken, schoolId, classId)),
      );
      const examSubjects = Array.from(state.selectedClassIds).flatMap((classId, i) =>
        perClassSubjects[i]
          .filter((row) => state.selectedSubjectIds.has(row.subjectId))
          .map((row) => ({ classId, subjectId: row.subjectId })),
      );
      const exam = await api.createExam(accessToken, schoolId, {
        academicYearId: state.academicYearId,
        name: state.name,
        type: state.type,
        startDate: state.startDate || undefined,
        endDate: state.endDate || undefined,
        description: state.description || undefined,
        examSubjects,
        maxMarks: Number(state.maxMarks),
        passingMark: state.passingMark.trim() ? Number(state.passingMark) : undefined,
        examDate: state.examDate || undefined,
      });
      setCreated(exam);
      show(`${exam.name} created with ${exam.examSubjects.length} subject(s) scheduled.`);
    } catch (err) {
      setSubmitError(err instanceof ApiError ? err.message : "Failed to create exam");
    } finally {
      setSubmitting(false);
    }
  }

  if (loadError) return <Alert tone="danger">{loadError}</Alert>;

  if (created) {
    return (
      <Card className="mx-auto max-w-lg text-center">
        <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-success-soft text-success">
          <CheckCircle2 className="size-6" />
        </div>
        <h2 className="mt-4 text-lg font-semibold text-foreground">Exam created</h2>
        <p className="mt-1 text-sm text-foreground-soft">
          {created.name} was scheduled with {created.examSubjects.length} subject(s) across{" "}
          {new Set(created.examSubjects.map((es) => es.classId)).size} class(es).
        </p>
        <div className="mt-6 flex justify-center gap-2">
          <Button variant="outline" onClick={() => router.push(`/schools/${schoolId}/academic?tab=Exams`)}>
            Back to Exams
          </Button>
          <Button onClick={() => setCreated(null)}>Create another</Button>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="overflow-x-auto pb-1">
        <Stepper steps={EXAM_WIZARD_STEPS.map((label) => ({ label }))} currentIndex={step} />
      </div>

      <Card>
        {!accessToken || years.length === 0 ? (
          <div className="flex items-center justify-center gap-2 py-8 text-sm text-foreground-muted">
            <Loader2 className="size-4 animate-spin" /> Loading…
          </div>
        ) : (
          <>
            {step === 0 && <BasicInfoStep state={state} years={years} onChange={patch} />}
            {step === 1 && (
              <ClassesSubjectsStep state={state} classes={classes} accessToken={accessToken} schoolId={schoolId} onChange={patch} />
            )}
            {step === 2 && <SettingsStep state={state} onChange={patch} />}
            {step === 3 && <ReviewStep state={state} years={years} classes={classes} availableSubjects={subjects} />}
          </>
        )}
      </Card>

      {submitError && <Alert tone="danger">{submitError}</Alert>}

      <div className="flex items-center justify-between">
        <Button
          variant="outline"
          icon={<ArrowLeft className="size-4" />}
          disabled={step === 0}
          onClick={() => setStep((s) => Math.max(0, s - 1))}
        >
          Back
        </Button>

        {step < EXAM_WIZARD_STEPS.length - 1 ? (
          <Button icon={<ArrowRight className="size-4" />} disabled={!canProceed} onClick={() => setStep((s) => s + 1)}>
            Next
          </Button>
        ) : (
          <Button
            icon={submitting ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
            disabled={submitting}
            onClick={submit}
          >
            {submitting ? "Creating…" : "Create Exam"}
          </Button>
        )}
      </div>
    </div>
  );
}
