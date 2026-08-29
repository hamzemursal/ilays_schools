"use client";

import { use } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { TeacherProfile } from "@/features/teachers/teacher-details/TeacherProfile";

export default function TeacherDetailPage({ params }: { params: Promise<{ id: string; teacherId: string }> }) {
  const { id: schoolId, teacherId } = use(params);

  return (
    <div>
      <PageHeader
        eyebrow="Teachers"
        title="Teacher profile"
        breadcrumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Teachers", href: `/schools/${schoolId}/teachers` },
          { label: "Profile" },
        ]}
      />
      <div className="mx-auto max-w-3xl p-4 sm:p-6">
        <TeacherProfile schoolId={schoolId} teacherId={teacherId} />
      </div>
    </div>
  );
}
