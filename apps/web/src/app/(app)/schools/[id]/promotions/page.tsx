"use client";

import { use } from "react";
import { useAuth } from "@/lib/auth-context";
import { PageHeader } from "@/components/ui/PageHeader";
import { ProgressionLanding } from "@/features/progression/ProgressionLanding";

export default function PromotionsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: schoolId } = use(params);
  const { user } = useAuth();
  const schoolName = user?.schools.find((s) => s.id === schoolId)?.name ?? "School";

  return (
    <div>
      <PageHeader
        eyebrow="Year-End Progression"
        title={schoolName}
        description="Progress every class at year end. Class 8 continues to Form 1; Form 4 graduates to Alumni."
        breadcrumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "Year-End Progression" }]}
      />
      <div className="mx-auto max-w-7xl p-4 sm:p-6">
        <ProgressionLanding schoolId={schoolId} />
      </div>
    </div>
  );
}
