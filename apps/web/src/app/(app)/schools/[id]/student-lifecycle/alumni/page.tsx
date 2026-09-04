"use client";

import { use } from "react";
import { LifecycleListExplorer } from "@/features/student-lifecycle/LifecycleListExplorer";

export default function SchoolAlumniPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: schoolId } = use(params);

  return (
    <LifecycleListExplorer
      kind="alumni"
      fixedSchoolId={schoolId}
      pageTitle="Alumni"
      breadcrumbs={[
        { label: "Dashboard", href: "/dashboard" },
        { label: "Student Lifecycle", href: `/schools/${schoolId}/student-lifecycle` },
        { label: "Alumni" },
      ]}
    />
  );
}
