"use client";

import { use } from "react";
import { LifecycleListExplorer } from "@/features/student-lifecycle/LifecycleListExplorer";

export default function SchoolSecondaryGraduatedPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: schoolId } = use(params);

  return (
    <LifecycleListExplorer
      kind="secondary-graduated"
      fixedSchoolId={schoolId}
      pageTitle="Secondary Graduated"
      breadcrumbs={[
        { label: "Dashboard", href: "/dashboard" },
        { label: "Student Lifecycle", href: `/schools/${schoolId}/student-lifecycle` },
        { label: "Secondary Graduated" },
      ]}
    />
  );
}
