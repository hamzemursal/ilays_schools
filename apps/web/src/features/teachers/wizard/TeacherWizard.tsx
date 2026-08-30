"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, CheckCircle2, Loader2 } from "lucide-react";
import { ApiError, useAuth } from "@/lib/auth-context";
import { api, type AcademicYear, type ClassWithSections, type Subject, type Teacher } from "@/lib/api";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { Stepper } from "@/components/ui/Stepper";
import { useToast } from "@/components/ui/Toast";
import { PersonalInfoStep, isPersonalInfoValid } from "./steps/PersonalInfoStep";
import { ContactStep } from "./steps/ContactStep";
import { AssignmentsStep, findDuplicateAssignmentIndexes } from "./steps/AssignmentsStep";
import { ReviewStep } from "./steps/ReviewStep";
import { emptyTeacherWizardState, TEACHER_WIZARD_STEPS, type TeacherWizardState } from "./types";

export function TeacherWizard({ schoolId }: { schoolId: string }) {
  const router = useRouter();
  const { accessToken } = useAuth();
  const { show } = useToast();

  const [years, setYears] = useState<AcademicYear[]>([]);
  const [classes, setClasses] = useState<ClassWithSections[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [step, setStep] = useState(0);
  const [state, setState] = useState<TeacherWizardState>(emptyTeacherWizardState());
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [created, setCreated] = useState<Teacher | null>(null);

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
      })
      .catch((err) => setLoadError(err instanceof ApiError ? err.message : "Failed to load form data"));
  }, [accessToken, schoolId]);

  useEffect(() => {
    return () => {
      if (state.photoPreviewUrl) URL.revokeObjectURL(state.photoPreviewUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function patch(p: Partial<TeacherWizardState>) {
    setState((prev) => ({ ...prev, ...p }));
  }

  const hasDuplicateAssignments = findDuplicateAssignmentIndexes(state.assignments).size > 0;
  const canProceed = step === 0 ? isPersonalInfoValid(state) : step === 2 ? !hasDuplicateAssignments : true;

  async function submit() {
    if (!accessToken) return;
    setSubmitError(null);
    setSubmitting(true);
    try {
      const teacher = await api.createTeacher(accessToken, schoolId, {
        firstName: state.firstName,
        lastName: state.lastName,
        phone: state.phone || undefined,
        email: state.email || undefined,
        qualification: state.qualification || undefined,
        assignments: state.assignments.length
          ? state.assignments.map((a) => ({
              academicYearId: a.academicYearId,
              sectionId: a.sectionId,
              subjectId: a.subjectId,
            }))
          : undefined,
      });

      if (state.photoFile) {
        await api.uploadTeacherPhoto(accessToken, schoolId, teacher.id, state.photoFile).catch(() => {
          show("Teacher created, but the photo failed to upload. You can add it from the profile.", "danger");
        });
      }

      setCreated(teacher);
      show(`${state.firstName} ${state.lastName} created.`);
    } catch (err) {
      setSubmitError(err instanceof ApiError ? err.message : "Failed to create teacher");
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
        <h2 className="mt-4 text-lg font-semibold text-foreground">Teacher created</h2>
        <p className="mt-1 text-sm text-foreground-soft">
          {created.firstName} {created.lastName} has been added.
        </p>
        <div className="mx-auto mt-5 max-w-xs rounded-lg border border-border bg-surface-soft px-3 py-2 text-left">
          <p className="text-xs font-medium uppercase tracking-wide text-foreground-muted">Staff code</p>
          <p className="mt-0.5 font-mono text-sm text-foreground">{created.employeeNumber}</p>
        </div>
        <div className="mt-6 flex justify-center gap-2">
          <Button variant="outline" onClick={() => router.push(`/schools/${schoolId}/teachers`)}>
            Back to teachers
          </Button>
          <Button onClick={() => router.push(`/schools/${schoolId}/teachers/${created.id}`)}>View teacher profile</Button>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="overflow-x-auto pb-1">
        <Stepper steps={TEACHER_WIZARD_STEPS.map((label) => ({ label }))} currentIndex={step} />
      </div>

      <Card>
        {step === 0 && <PersonalInfoStep state={state} onChange={patch} />}
        {step === 1 && <ContactStep state={state} onChange={patch} />}
        {step === 2 && <AssignmentsStep state={state} onChange={patch} years={years} classes={classes} subjects={subjects} />}
        {step === 3 && <ReviewStep state={state} years={years} classes={classes} subjects={subjects} />}
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

        {step < TEACHER_WIZARD_STEPS.length - 1 ? (
          <Button icon={<ArrowRight className="size-4" />} disabled={!canProceed} onClick={() => setStep((s) => s + 1)}>
            Next
          </Button>
        ) : (
          <Button
            icon={submitting ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
            disabled={submitting || hasDuplicateAssignments}
            onClick={submit}
          >
            {submitting ? "Creating…" : "Create teacher"}
          </Button>
        )}
      </div>
    </div>
  );
}
