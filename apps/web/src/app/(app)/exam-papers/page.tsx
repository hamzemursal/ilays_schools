"use client";

import { ExamPapersExplorer } from "@/features/exams/ExamPapersExplorer";

export default function OrgExamPapersPage() {
  return (
    <ExamPapersExplorer
      pageTitle="Exam Papers"
      breadcrumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "Exam Papers" }]}
    />
  );
}
