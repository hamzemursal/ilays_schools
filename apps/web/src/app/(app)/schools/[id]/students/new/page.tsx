"use client";

import { use } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { StudentWizard } from "@/features/students/wizard/StudentWizard";

export default function NewStudentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: schoolId } = use(params);

  return (
    <div>
      <PageHeader
        eyebrow="Students"
        title="Add student"
        breadcrumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Students", href: `/schools/${schoolId}/students` },
          { label: "Add student" },
        ]}
      />
      <div className="mx-auto max-w-3xl p-4 sm:p-6">
        <StudentWizard schoolId={schoolId} />
      </div>
    </div>
  );
}
