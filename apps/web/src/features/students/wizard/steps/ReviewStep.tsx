import { Cake, GraduationCap, User, Users } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Avatar } from "@/components/ui/Avatar";
import type { AcademicYear, ClassWithSections } from "@/lib/api";
import type { WizardState } from "../types";

const RELATIONSHIP_LABEL: Record<string, string> = {
  FATHER: "Father",
  MOTHER: "Mother",
  GUARDIAN: "Guardian",
  OTHER: "Other",
};

export function ReviewStep({
  state,
  years,
  classes,
}: {
  state: WizardState;
  years: AcademicYear[];
  classes: ClassWithSections[];
}) {
  const year = years.find((y) => y.id === state.academicYearId);
  const cls = classes.find((c) => c.id === state.classId);
  const section = cls?.sections.find((s) => s.id === state.sectionId);

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-sm font-semibold text-foreground">Review &amp; confirm</h2>
        <p className="mt-0.5 text-sm text-foreground-soft">
          Student number and roll number are generated automatically once you create this student.
        </p>
      </div>

      <Card padding="none">
        <CardHeader title="Student" />
        <div className="flex items-center gap-4 p-5">
          <Avatar name={`${state.firstName} ${state.lastName}`} photoUrl={state.photoPreviewUrl} size="lg" />
          <div>
            <p className="font-medium text-foreground">
              {state.firstName} {state.lastName}
            </p>
            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-sm text-foreground-soft">
              <span className="inline-flex items-center gap-1">
                <Cake className="size-3.5" /> {state.dateOfBirth}
              </span>
              <span className="inline-flex items-center gap-1">
                <User className="size-3.5" /> {state.sex === "MALE" ? "Male" : "Female"}
              </span>
            </div>
          </div>
        </div>
      </Card>

      <Card padding="none">
        <CardHeader title="Enrollment" />
        <div className="grid grid-cols-3 gap-4 p-5 text-sm">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-foreground-muted">Academic year</p>
            <p className="mt-0.5 text-foreground">{year?.name}</p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-foreground-muted">Class</p>
            <p className="mt-0.5 text-foreground">{cls?.name}</p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-foreground-muted">Section</p>
            <p className="mt-0.5 text-foreground">{section?.name}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 border-t border-border px-5 py-3 text-sm text-foreground-soft">
          <GraduationCap className="size-4" />
          Student number and roll number will be assigned automatically on creation.
        </div>
      </Card>

      <Card padding="none">
        <CardHeader title="Parent / guardian" />
        <div className="p-5">
          {state.guardians.length === 0 ? (
            <p className="flex items-center gap-2 text-sm text-foreground-muted">
              <Users className="size-4" /> None added — you can add one later from the student&apos;s profile.
            </p>
          ) : (
            <div className="space-y-2">
              {state.guardians.map((g) => (
                <div key={g.key} className="flex items-center justify-between text-sm">
                  <span className="text-foreground">
                    {g.firstName} {g.lastName}{" "}
                    <span className="text-foreground-soft">({RELATIONSHIP_LABEL[g.relationship]})</span>
                  </span>
                  <div className="flex items-center gap-2">
                    {g.isPrimaryContact && <Badge tone="success">Primary</Badge>}
                    <Badge tone={g.mode === "existing" ? "accent" : "neutral"}>
                      {g.mode === "existing" ? "Existing" : "New"}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
