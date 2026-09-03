"use client";

import { use } from "react";
import { useAuth } from "@/lib/auth-context";
import { AuditLogExplorer } from "@/features/audit-log/AuditLogExplorer";

export default function AuditLogPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: schoolId } = use(params);
  const { user } = useAuth();

  const schoolName = user?.schools.find((s) => s.id === schoolId)?.name ?? "School";

  return (
    <AuditLogExplorer
      fixedSchoolId={schoolId}
      pageTitle={schoolName}
      schoolName={schoolName}
      breadcrumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "Audit log" }]}
    />
  );
}
