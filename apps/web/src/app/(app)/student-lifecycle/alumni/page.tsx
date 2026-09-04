"use client";

import { LifecycleListExplorer } from "@/features/student-lifecycle/LifecycleListExplorer";

export default function OrgAlumniPage() {
  return (
    <LifecycleListExplorer
      kind="alumni"
      pageTitle="Alumni — All Schools"
      breadcrumbs={[
        { label: "Dashboard", href: "/dashboard" },
        { label: "Student Lifecycle", href: "/student-lifecycle" },
        { label: "Alumni" },
      ]}
    />
  );
}
