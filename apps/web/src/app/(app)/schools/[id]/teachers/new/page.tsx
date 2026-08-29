"use client";

import { use } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { TeacherWizard } from "@/features/teachers/wizard/TeacherWizard";

export default function NewTeacherPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: schoolId } = use(params);

  return (
    <div>
      <PageHeader
        eyebrow="Teachers"
        title="Add teacher"
        breadcrumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Teachers", href: `/schools/${schoolId}/teachers` },
          { label: "Add teacher" },
        ]}
      />
      <div className="mx-auto max-w-3xl p-4 sm:p-6">
        <TeacherWizard schoolId={schoolId} />
      </div>
    </div>
  );
}
