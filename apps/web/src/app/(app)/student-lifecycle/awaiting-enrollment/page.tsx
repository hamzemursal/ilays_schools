"use client";

import { LifecycleListExplorer } from "@/features/student-lifecycle/LifecycleListExplorer";

export default function OrgAwaitingEnrollmentPage() {
  return (
    <LifecycleListExplorer
      kind="awaiting-enrollment"
      pageTitle="Awaiting Enrollment — All Schools"
      breadcrumbs={[
        { label: "Dashboard", href: "/dashboard" },
        { label: "Student Lifecycle", href: "/student-lifecycle" },
        { label: "Awaiting Enrollment" },
      ]}
    />
  );
}
