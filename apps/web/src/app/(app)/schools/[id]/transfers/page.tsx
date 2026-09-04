"use client";

import { use } from "react";
import { useAuth } from "@/lib/auth-context";
import { TransfersOverview } from "@/features/transfers/TransfersOverview";

export default function TransfersPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: schoolId } = use(params);
  const { user } = useAuth();
  const schoolName = user?.schools.find((s) => s.id === schoolId)?.name ?? "School";

  return (
    <TransfersOverview
      fixedSchoolId={schoolId}
      pageTitle={schoolName}
      breadcrumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "Transfers" }]}
    />
  );
}
