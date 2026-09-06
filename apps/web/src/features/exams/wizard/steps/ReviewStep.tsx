"use client";

import { Card, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Alert } from "@/components/ui/Alert";
import type { AcademicYear, ClassWithSections, Subject } from "@/lib/api";
import type { ExamWizardState } from "../types";

const EXAM_TYPE_LABELS: Record<string, string> = {
  QUIZ: "Quiz",
  MIDTERM: "Mid-Term",
  FINAL: "Final",
  ASSIGNMENT: "Assignment",
  OTHER: "Other",
};

function formatDate(value: string): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString();
}

export function ReviewStep({
  state,
  years,
  classes,
  availableSubjects,
}: {
  state: ExamWizardState;
  years: AcademicYear[];
  classes: ClassWithSections[];
  availableSubjects: Subject[];
}) {
  const year = years.find((y) => y.id === state.academicYearId);
  const selectedClasses = classes.filter((c) => state.selectedClassIds.has(c.id));
  const selectedSubjects = availableSubjects.filter((s) => state.selectedSubjectIds.has(s.id));

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-sm font-semibold text-foreground">Review &amp; create</h2>
        <p className="mt-0.5 text-sm text-foreground-soft">
          {selectedClasses.length} class{selectedClasses.length === 1 ? "" : "es"} × {selectedSubjects.length} subject
          {selectedSubjects.length === 1 ? "" : "s"} will be scheduled for this exam.
        </p>
      </div>

      <Card padding="none">
        <CardHeader title="Exam" />
        <div className="grid grid-cols-1 gap-x-6 gap-y-3 p-5 text-sm sm:grid-cols-2">
          <Field label="Name" value={state.name} />
          <Field label="Type" value={EXAM_TYPE_LABELS[state.type] ?? state.type} />
          <Field label="Academic Year" value={year?.name ?? "—"} />
          <Field label="Start Date" value={formatDate(state.startDate)} />
          <Field label="End Date" value={formatDate(state.endDate)} />
          {state.description && (
            <div className="sm:col-span-2">
              <p className="text-xs font-medium uppercase tracking-wide text-foreground-muted">Description</p>
              <p className="mt-1 text-foreground">{state.description}</p>
            </div>
          )}
        </div>
      </Card>

      <Card padding="none">
        <CardHeader title="Classes" description={`${selectedClasses.length} selected`} />
        <div className="flex flex-wrap gap-2 p-5">
          {selectedClasses.map((c) => (
            <Badge key={c.id} tone="accent">
              {c.name}
            </Badge>
          ))}
        </div>
      </Card>

      <Card padding="none">
        <CardHeader title="Subjects" description={`${selectedSubjects.length} selected`} />
        <div className="flex flex-wrap gap-2 p-5">
          {selectedSubjects.map((s) => (
            <Badge key={s.id} tone="accent">
              {s.name}
            </Badge>
          ))}
        </div>
      </Card>

      <Card padding="none">
        <CardHeader title="Settings" />
        <div className="grid grid-cols-1 gap-x-6 gap-y-3 p-5 text-sm sm:grid-cols-2">
          <Field label="Maximum Mark" value={state.maxMarks || "—"} />
          <Field label="Passing Mark" value={state.passingMark || "Not set"} />
          <Field label="Exam Date (all subjects)" value={formatDate(state.examDate)} />
        </div>
      </Card>

      <Alert tone="info">
        Each subject will be created with the settings above — you can still fine-tune any individual subject&apos;s date or marks
        afterward from the Exams tab.
      </Alert>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-foreground-muted">{label}</p>
      <p className="mt-1 text-foreground">{value}</p>
    </div>
  );
}
