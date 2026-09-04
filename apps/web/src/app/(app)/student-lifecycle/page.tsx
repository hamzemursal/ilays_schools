"use client";

import { StudentLifecycleOverview } from "@/features/student-lifecycle/StudentLifecycleOverview";

// Org-wide — Super Admin/Organization Admin only (gated in nav-config.ts on
// the same schools.view + students.view combination as the "Schools" link).
// A School Admin who somehow reaches this URL is still scoped to their own
// school by the backend itself, same as the org-wide Audit Log page.
export default function OrgStudentLifecyclePage() {
  return (
    <StudentLifecycleOverview
      pageTitle="All Schools"
      breadcrumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "Student Lifecycle" }]}
    />
  );
}
