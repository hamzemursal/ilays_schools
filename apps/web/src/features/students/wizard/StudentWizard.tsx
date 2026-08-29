"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, CheckCircle2, Loader2 } from "lucide-react";
import { ApiError, useAuth } from "@/lib/auth-context";
import { api, type AcademicYear, type ClassWithSections, type DuplicateCandidate } from "@/lib/api";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { Stepper } from "@/components/ui/Stepper";
import { useToast } from "@/components/ui/Toast";
import { PersonalInfoStep, isPersonalInfoValid } from "./steps/PersonalInfoStep";
import { GuardianStep } from "./steps/GuardianStep";
import { EnrollmentStep, isEnrollmentValid } from "./steps/EnrollmentStep";
import { SubjectsStep } from "./steps/SubjectsStep";
import { ReviewStep } from "./steps/ReviewStep";
import { emptyWizardState, WIZARD_STEPS, type WizardState } from "./types";

type Phase = "wizard" | "duplicates" | "success";

export function StudentWizard({ schoolId }: { schoolId: string }) {
  const router = useRouter();
  const { accessToken } = useAuth();
  const { show } = useToast();

  const [years, setYears] = useState<AcademicYear[]>([]);
  const [classes, setClasses] = useState<ClassWithSections[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [step, setStep] = useState(0);
  const [state, setState] = useState<WizardState>(emptyWizardState());
  const [phase, setPhase] = useState<Phase>("wizard");
  const [duplicates, setDuplicates] = useState<DuplicateCandidate[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ id: string; studentNumber: string; rollNumber: number } | null>(null);

  useEffect(() => {
    if (!accessToken) return;
    Promise.all([api.listAcademicYears(accessToken, schoolId), api.listClasses(accessToken, schoolId)])
      .then(([y, c]) => {
        setYears(y);
        setClasses(c);
        const current = y.find((yr) => yr.isCurrent) ?? y[0];
        if (current) setState((prev) => ({ ...prev, academicYearId: current.id }));
      })
      .catch((err) => setLoadError(err instanceof ApiError ? err.message : "Failed to load form data"));
  }, [accessToken, schoolId]);

  useEffect(() => {
    return () => {
      if (state.photoPreviewUrl) URL.revokeObjectURL(state.photoPreviewUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function patch(p: Partial<WizardState>) {
    setState((prev) => ({ ...prev, ...p }));
  }

  const canProceed =
    step === 0 ? isPersonalInfoValid(state) : step === 2 ? isEnrollmentValid(state) : true;

  async function submit(confirmDespiteDuplicates: boolean) {
    if (!accessToken) return;
    setSubmitError(null);
    setSubmitting(true);
    try {
      const result = await api.createStudent(accessToken, schoolId, {
        firstName: state.firstName,
        lastName: state.lastName,
        dateOfBirth: state.dateOfBirth,
        sex: state.sex,
        enrollment: {
          academicYearId: state.academicYearId,
          classId: state.classId,
          sectionId: state.sectionId,
        },
        guardians: state.guardians.length
          ? state.guardians.map((g) => ({
              firstName: g.firstName,
              lastName: g.lastName,
              phone: g.phone || undefined,
              email: g.email || undefined,
              relationship: g.relationship,
              isPrimaryContact: g.isPrimaryContact,
            }))
          : undefined,
        confirmDespiteDuplicates,
      });

      const studentId = result.student.id;
      if (state.photoFile) {
        await api.uploadStudentPhoto(accessToken, studentId, state.photoFile).catch(() => {
          show("Student created, but the photo failed to upload. You can add it from the profile.", "danger");
        });
      }

      const enrollment = result.enrollment as { studentNumber: string; rollNumber: number };
      setCreated({ id: studentId, studentNumber: enrollment.studentNumber, rollNumber: enrollment.rollNumber });
      setPhase("success");
      show(`${state.firstName} ${state.lastName} created.`);
    } catch (err) {
      if (
        err instanceof ApiError &&
        err.status === 409 &&
        (err.body as { possibleDuplicates?: DuplicateCandidate[] })?.possibleDuplicates
      ) {
        setDuplicates((err.body as { possibleDuplicates: DuplicateCandidate[] }).possibleDuplicates);
        setPhase("duplicates");
      } else {
        setSubmitError(err instanceof ApiError ? err.message : "Failed to create student");
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (loadError) return <Alert tone="danger">{loadError}</Alert>;

  if (phase === "success" && created) {
    return (
      <Card className="mx-auto max-w-lg text-center">
        <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-success-soft text-success">
          <CheckCircle2 className="size-6" />
        </div>
        <h2 className="mt-4 text-lg font-semibold text-foreground">Student created</h2>
        <p className="mt-1 text-sm text-foreground-soft">
          {state.firstName} {state.lastName} has been enrolled.
        </p>
        <div className="mx-auto mt-5 grid max-w-xs grid-cols-2 gap-3 text-left">
          <div className="rounded-lg border border-border bg-surface-soft px-3 py-2">
            <p className="text-xs font-medium uppercase tracking-wide text-foreground-muted">Student number</p>
            <p className="mt-0.5 font-mono text-sm text-foreground">{created.studentNumber}</p>
          </div>
          <div className="rounded-lg border border-border bg-surface-soft px-3 py-2">
            <p className="text-xs font-medium uppercase tracking-wide text-foreground-muted">Roll number</p>
            <p className="mt-0.5 font-mono text-sm text-foreground">{created.rollNumber}</p>
          </div>
        </div>
        <div className="mt-6 flex justify-center gap-2">
          <Button variant="outline" onClick={() => router.push(`/schools/${schoolId}/students`)}>
            Back to students
          </Button>
          <Button onClick={() => router.push(`/schools/${schoolId}/students/${created.id}`)}>
            View student profile
          </Button>
        </div>
      </Card>
    );
  }

  if (phase === "duplicates") {
    return (
      <Card>
        <span className="text-xs font-semibold uppercase tracking-wide text-warning">Possible duplicate</span>
        <h2 className="mt-1 text-lg font-semibold text-foreground">
          {duplicates.length} similar student{duplicates.length > 1 ? "s" : ""} already exist
        </h2>
        <p className="mt-2 text-sm text-foreground-soft">
          Same last name and date of birth as someone already in the system. Review before continuing — this is
          never merged automatically.
        </p>
        <ul className="mt-4 space-y-2">
          {duplicates.map((d) => (
            <li key={d.id} className="rounded-xl border border-border bg-surface-soft p-4">
              <p className="font-medium text-foreground">
                {d.firstName} {d.lastName}
              </p>
              <p className="text-sm text-foreground-soft">Born {new Date(d.dateOfBirth).toLocaleDateString()}</p>
            </li>
          ))}
        </ul>
        {submitError && (
          <Alert tone="danger" className="mt-4">
            {submitError}
          </Alert>
        )}
        <div className="mt-6 flex flex-wrap gap-3">
          <Button variant="outline" onClick={() => setPhase("wizard")}>
            Go back and check
          </Button>
          <Button variant="danger" loading={submitting} onClick={() => submit(true)}>
            This is a different person — create anyway
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="overflow-x-auto pb-1">
        <Stepper steps={WIZARD_STEPS.map((label) => ({ label }))} currentIndex={step} />
      </div>

      <Card>
        {step === 0 && <PersonalInfoStep state={state} onChange={patch} />}
        {step === 1 && <GuardianStep schoolId={schoolId} state={state} onChange={patch} />}
        {step === 2 && <EnrollmentStep state={state} onChange={patch} years={years} classes={classes} />}
        {step === 3 && <SubjectsStep schoolId={schoolId} state={state} />}
        {step === 4 && <ReviewStep state={state} years={years} classes={classes} />}
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

        {step < WIZARD_STEPS.length - 1 ? (
          <Button icon={<ArrowRight className="size-4" />} disabled={!canProceed} onClick={() => setStep((s) => s + 1)}>
            Next
          </Button>
        ) : (
          <Button
            icon={submitting ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
            disabled={submitting}
            onClick={() => submit(false)}
          >
            {submitting ? "Creating…" : "Create student"}
          </Button>
        )}
      </div>
    </div>
  );
}
