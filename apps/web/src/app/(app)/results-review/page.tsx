"use client";

import { ResultsReviewExplorer } from "@/features/exams/ResultsReviewExplorer";

export default function OrgResultsReviewPage() {
  return (
    <ResultsReviewExplorer
      pageTitle="Results Review"
      breadcrumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "Results Review" }]}
    />
  );
}
