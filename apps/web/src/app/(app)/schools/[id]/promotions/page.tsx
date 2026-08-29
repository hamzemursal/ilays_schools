"use client";

import { use } from "react";
import { useAuth } from "@/lib/auth-context";
import { PageHeader } from "@/components/ui/PageHeader";
import { PromotionWizard } from "@/features/promotions/forms/PromotionWizard";

export default function PromotionsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: schoolId } = use(params);
  const { user } = useAuth();
  const schoolName = user?.schools.find((s) => s.id === schoolId)?.name ?? "School";

  return (
    <div>
      <PageHeader
        eyebrow="Promotions"
        title={schoolName}
        description="Move a section's students to the next class, or mark them complete/graduated, at year end."
        breadcrumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "Promotions" }]}
      />
      <div className="mx-auto max-w-3xl p-4 sm:p-6">
        <PromotionWizard schoolId={schoolId} />
      </div>
    </div>
  );
}
