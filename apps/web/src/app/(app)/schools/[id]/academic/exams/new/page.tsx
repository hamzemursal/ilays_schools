"use client";

import { use } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { ExamWizard } from "@/features/exams/wizard/ExamWizard";

export default function NewExamPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: schoolId } = use(params);

  return (
    <div>
      <PageHeader
        eyebrow="Exams & Results"
        title="Create Exam"
        breadcrumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Academic", href: `/schools/${schoolId}/academic` },
          { label: "Create Exam" },
        ]}
      />
      <div className="mx-auto max-w-3xl p-4 sm:p-6">
        <ExamWizard schoolId={schoolId} />
      </div>
    </div>
  );
}
