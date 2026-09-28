"use client";

import { use } from "react";
import { useSearchParams } from "next/navigation";
import { PageHeader } from "@/components/ui/PageHeader";
import { PromotionWizard } from "@/features/promotions/forms/PromotionWizard";

// Ordinary same-division promotion (Class 1–7, Form 1–3), opened from a class
// card on the Year-End Progression landing page with that class preselected.
export default function PromoteClassPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: schoolId } = use(params);
  const searchParams = useSearchParams();

  return (
    <div>
      <PageHeader
        eyebrow="Year-End Progression"
        title="Promote a class"
        description="Move a section's students to the next class, or retain them, for the next academic year."
        breadcrumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Year-End Progression", href: `/schools/${schoolId}/promotions` },
          { label: "Promote" },
        ]}
      />
      <div className="mx-auto max-w-6xl p-4 sm:p-6">
        <PromotionWizard
          schoolId={schoolId}
          initialClassId={searchParams.get("classId") ?? undefined}
          initialFromYearId={searchParams.get("academicYearId") ?? undefined}
        />
      </div>
    </div>
  );
}
