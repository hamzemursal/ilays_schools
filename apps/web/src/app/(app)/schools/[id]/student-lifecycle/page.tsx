"use client";

import { use } from "react";
import { useAuth } from "@/lib/auth-context";
import { StudentLifecycleOverview } from "@/features/student-lifecycle/StudentLifecycleOverview";

export default function SchoolStudentLifecyclePage({ params }: { params: Promise<{ id: string }> }) {
  const { id: schoolId } = use(params);
  const { user } = useAuth();
  const schoolName = user?.schools.find((s) => s.id === schoolId)?.name ?? "School";

  return (
    <StudentLifecycleOverview
      fixedSchoolId={schoolId}
      pageTitle={schoolName}
      breadcrumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "Student Lifecycle" }]}
    />
  );
}
