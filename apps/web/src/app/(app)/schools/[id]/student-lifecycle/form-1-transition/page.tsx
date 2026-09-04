"use client";

import { use } from "react";
import { useAuth } from "@/lib/auth-context";
import { PageHeader } from "@/components/ui/PageHeader";
import { Form1TransitionWizard } from "@/features/student-lifecycle/Form1TransitionWizard";

export default function Form1TransitionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: schoolId } = use(params);
  const { user } = useAuth();
  const schoolName = user?.schools.find((s) => s.id === schoolId)?.name ?? "School";

  return (
    <div>
      <PageHeader
        eyebrow="Student Lifecycle"
        title="Form 1 Transition"
        description="Explicitly enroll completed Primary students into Form 1 — never automatic."
        breadcrumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Student Lifecycle", href: `/schools/${schoolId}/student-lifecycle` },
          { label: "Form 1 Transition" },
        ]}
      />
      <div className="mx-auto max-w-3xl p-4 sm:p-6">
        <Form1TransitionWizard schoolId={schoolId} schoolName={schoolName} />
      </div>
    </div>
  );
}
