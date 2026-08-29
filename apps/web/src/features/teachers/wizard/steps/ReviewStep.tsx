"use client";

import { Mail, Phone } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Alert } from "@/components/ui/Alert";
import { Avatar } from "@/components/ui/Avatar";
import type { AcademicYear, ClassWithSections, Subject } from "@/lib/api";
import type { TeacherWizardState } from "../types";

export function ReviewStep({
  state,
  years,
  classes,
  subjects,
}: {
  state: TeacherWizardState;
  years: AcademicYear[];
  classes: ClassWithSections[];
  subjects: Subject[];
}) {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-sm font-semibold text-foreground">Review &amp; confirm</h2>
        <p className="mt-0.5 text-sm text-foreground-soft">A staff code is generated automatically once you create this teacher.</p>
      </div>

      <Card padding="none">
        <CardHeader title="Teacher" />
        <div className="flex items-center gap-4 p-5">
          <Avatar name={`${state.firstName} ${state.lastName}`} photoUrl={state.photoPreviewUrl} size="lg" />
          <div>
            <p className="font-medium text-foreground">
              {state.firstName} {state.lastName}
            </p>
            {state.qualification && <p className="mt-1 text-sm text-foreground-soft">{state.qualification}</p>}
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-foreground-soft">
              {state.phone && (
                <span className="inline-flex items-center gap-1.5">
                  <Phone className="size-3.5" /> {state.phone}
                </span>
              )}
              {state.email && (
                <span className="inline-flex items-center gap-1.5">
                  <Mail className="size-3.5" /> {state.email}
                </span>
              )}
              {!state.phone && !state.email && <span className="text-foreground-muted">No contact on file</span>}
            </div>
          </div>
        </div>
      </Card>

      <Card padding="none">
        <CardHeader title="Assignments" description={state.assignments.length === 0 ? "None yet" : undefined} />
        {state.assignments.length > 0 && (
          <div className="flex flex-wrap gap-2 p-5">
            {state.assignments.map((a, i) => {
              const year = years.find((y) => y.id === a.academicYearId);
              const cls = classes.find((c) => c.id === a.classId);
              const section = cls?.sections.find((s) => s.id === a.sectionId);
              const subject = subjects.find((s) => s.id === a.subjectId);
              return (
                <Badge key={i} tone="accent">
                  {year?.name} · {cls?.name} {section?.name} · {subject?.name}
                </Badge>
              );
            })}
          </div>
        )}
      </Card>

      <Alert tone="info">Review the details above, then create the teacher.</Alert>
    </div>
  );
}
