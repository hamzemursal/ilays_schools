"use client";

import { use } from "react";
import { useSearchParams } from "next/navigation";
import { PageHeader } from "@/components/ui/PageHeader";
import { Form4Graduation } from "@/features/progression/Form4Graduation";

export default function Form4GraduationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: schoolId } = use(params);
  const searchParams = useSearchParams();

  return (
    <div>
      <PageHeader
        eyebrow="Year-End Progression"
        title="Form 4 Graduation"
        description="Graduate Form 4 students to Alumni, or retain those who did not meet the requirement."
        breadcrumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Year-End Progression", href: `/schools/${schoolId}/promotions` },
          { label: "Form 4" },
        ]}
      />
      <div className="mx-auto max-w-7xl p-4 sm:p-6">
        <Form4Graduation schoolId={schoolId} initialYearId={searchParams.get("academicYearId") ?? undefined} />
      </div>
    </div>
  );
}
