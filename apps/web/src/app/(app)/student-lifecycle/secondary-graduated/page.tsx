"use client";

import { LifecycleListExplorer } from "@/features/student-lifecycle/LifecycleListExplorer";

export default function OrgSecondaryGraduatedPage() {
  return (
    <LifecycleListExplorer
      kind="secondary-graduated"
      pageTitle="Secondary Graduated — All Schools"
      breadcrumbs={[
        { label: "Dashboard", href: "/dashboard" },
        { label: "Student Lifecycle", href: "/student-lifecycle" },
        { label: "Secondary Graduated" },
      ]}
    />
  );
}
