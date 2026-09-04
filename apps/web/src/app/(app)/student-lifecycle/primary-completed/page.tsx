"use client";

import { LifecycleListExplorer } from "@/features/student-lifecycle/LifecycleListExplorer";

export default function OrgPrimaryCompletedPage() {
  return (
    <LifecycleListExplorer
      kind="primary-completed"
      pageTitle="Primary Completed — All Schools"
      breadcrumbs={[
        { label: "Dashboard", href: "/dashboard" },
        { label: "Student Lifecycle", href: "/student-lifecycle" },
        { label: "Primary Completed" },
      ]}
    />
  );
}
