"use client";

import { use } from "react";
import { useSearchParams } from "next/navigation";
import { PageHeader } from "@/components/ui/PageHeader";
import { Class8Progression } from "@/features/progression/Class8Progression";

export default function Class8ProgressionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: schoolId } = use(params);
  const searchParams = useSearchParams();

  return (
    <div>
      <PageHeader
        eyebrow="Year-End Progression"
        title="Class 8 Year-End Progression"
        description="Continue to Form 1, retain in Class 8, or complete without continuing — in one guided workflow."
        breadcrumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Year-End Progression", href: `/schools/${schoolId}/promotions` },
          { label: "Class 8" },
        ]}
      />
      <div className="mx-auto max-w-7xl p-4 sm:p-6">
        <Class8Progression schoolId={schoolId} initialYearId={searchParams.get("academicYearId") ?? undefined} />
      </div>
    </div>
  );
}
