"use client";

import { use } from "react";
import { LifecycleListExplorer } from "@/features/student-lifecycle/LifecycleListExplorer";

export default function SchoolAwaitingEnrollmentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: schoolId } = use(params);

  return (
    <LifecycleListExplorer
      kind="awaiting-enrollment"
      fixedSchoolId={schoolId}
      pageTitle="Awaiting Enrollment"
      breadcrumbs={[
        { label: "Dashboard", href: "/dashboard" },
        { label: "Student Lifecycle", href: `/schools/${schoolId}/student-lifecycle` },
        { label: "Awaiting Enrollment" },
      ]}
    />
  );
}
