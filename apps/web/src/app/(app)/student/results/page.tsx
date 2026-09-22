"use client";

import { useCallback } from "react";
import { useAuth } from "@/lib/auth-context";
import { api } from "@/lib/api";
import { PageHeader } from "@/components/ui/PageHeader";
import { SkeletonCards } from "@/components/ui/Skeleton";
import { StudentResultsView } from "@/features/student-portal/StudentResultsView";

export default function StudentResultsPage() {
  const { accessToken } = useAuth();

  return (
    <div>
      <PageHeader
        eyebrow="Student Portal"
        title="Results"
        description="Your published exam results, by academic year and term."
      />

      <div className="space-y-5 p-4 sm:p-6">
        {!accessToken ? <SkeletonCards count={2} /> : <YearResults accessToken={accessToken} />}
      </div>
    </div>
  );
}

function YearResults({ accessToken }: { accessToken: string }) {
  const loadYears = useCallback(() => api.getMyStudentAcademicYears(accessToken), [accessToken]);
  const loadReport = useCallback(
    (academicYearId: string) => api.getMyStudentResultsReport(accessToken, academicYearId),
    [accessToken],
  );
  return <StudentResultsView loadYears={loadYears} loadReport={loadReport} />;
}
