"use client";

import { use } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { StudentProfile } from "@/features/students/student-details/StudentProfile";

export default function StudentDetailPage({ params }: { params: Promise<{ id: string; studentId: string }> }) {
  const { id: schoolId, studentId } = use(params);

  return (
    <div>
      <PageHeader
        eyebrow="Students"
        title="Student profile"
        breadcrumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Students", href: `/schools/${schoolId}/students` },
          { label: "Profile" },
        ]}
      />
      <div className="mx-auto max-w-4xl p-4 sm:p-6">
        <StudentProfile studentId={studentId} />
      </div>
    </div>
  );
}
