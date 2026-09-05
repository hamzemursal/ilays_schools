"use client";

import { use } from "react";
import { useAuth } from "@/lib/auth-context";
import { ResultsReviewExplorer } from "@/features/exams/ResultsReviewExplorer";

export default function SchoolResultsReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: schoolId } = use(params);
  const { user } = useAuth();
  const schoolName = user?.schools.find((s) => s.id === schoolId)?.name ?? "School";

  return (
    <ResultsReviewExplorer
      fixedSchoolId={schoolId}
      pageTitle={`Results Review — ${schoolName}`}
      breadcrumbs={[{ label: "Dashboard", href: `/schools/${schoolId}/dashboard` }, { label: "Results Review" }]}
    />
  );
}
