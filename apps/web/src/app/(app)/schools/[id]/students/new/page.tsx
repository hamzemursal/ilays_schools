"use client";

import { use } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { StudentForm } from "@/features/students/forms/StudentForm";

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
      <div className="mx-auto max-w-2xl p-4 sm:p-6">
        <StudentForm schoolId={schoolId} />
      </div>
    </div>
  );
}
