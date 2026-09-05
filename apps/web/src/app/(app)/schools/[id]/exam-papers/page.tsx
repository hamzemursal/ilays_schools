"use client";

import { use } from "react";
import { useAuth } from "@/lib/auth-context";
import { ExamPapersExplorer } from "@/features/exams/ExamPapersExplorer";

export default function SchoolExamPapersPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: schoolId } = use(params);
  const { user } = useAuth();
  const schoolName = user?.schools.find((s) => s.id === schoolId)?.name ?? "School";

  return (
    <ExamPapersExplorer
      fixedSchoolId={schoolId}
      pageTitle={`Exam Papers — ${schoolName}`}
      breadcrumbs={[{ label: "Dashboard", href: `/schools/${schoolId}/dashboard` }, { label: "Exam Papers" }]}
    />
  );
}
