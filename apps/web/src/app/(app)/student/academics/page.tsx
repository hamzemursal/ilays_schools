"use client";

import { useEffect, useState } from "react";
import { useAuth, ApiError } from "@/lib/auth-context";
import { api, type MyChildSubject } from "@/lib/api";
import { useStudentProfile } from "@/features/student-portal/useStudentProfile";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardHeader } from "@/components/ui/Card";
import { Alert } from "@/components/ui/Alert";
import { EmptyState } from "@/components/ui/EmptyState";
import { SkeletonCards } from "@/components/ui/Skeleton";
import { BookUser, GraduationCap } from "lucide-react";

export default function StudentAcademicsPage() {
  const { accessToken } = useAuth();
  const { profile, error: profileError } = useStudentProfile();
  const [subjects, setSubjects] = useState<MyChildSubject[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken || !profile) return;
    api
      .getMyStudentSubjects(accessToken, profile.enrollment.academicYearId)
      .then(setSubjects)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load subjects"));
  }, [accessToken, profile]);

  return (
    <div>
      <PageHeader eyebrow="Student Portal" title="Academics" description="Your current class, subjects, and teachers." />

      <div className="space-y-5 p-4 sm:p-6">
        {profileError ? (
          <Alert tone="danger">{profileError}</Alert>
        ) : !profile ? (
          <SkeletonCards count={2} />
        ) : (
          <Card padding="none">
            <CardHeader title="Current enrollment" />
            <div className="grid grid-cols-2 gap-4 p-5 sm:grid-cols-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-foreground-muted">Academic year</p>
                <p className="mt-1 text-sm text-foreground">{profile.enrollment.academicYearName}</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-foreground-muted">School</p>
                <p className="mt-1 text-sm text-foreground">{profile.enrollment.schoolName}</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-foreground-muted">Class</p>
                <p className="mt-1 text-sm text-foreground">{profile.enrollment.className}</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-foreground-muted">Section</p>
                <p className="mt-1 text-sm text-foreground">{profile.enrollment.sectionName}</p>
              </div>
            </div>
          </Card>
        )}

        <Card padding="none">
          <CardHeader
            title="Subjects & teachers"
            description="Subjects offered in your class this year, and who teaches each one."
          />
          <div className="p-5">
            {error ? (
              <Alert tone="danger">{error}</Alert>
            ) : !subjects ? (
              <SkeletonCards count={2} />
            ) : subjects.length === 0 ? (
              <EmptyState icon={GraduationCap} title="No subjects assigned yet" />
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {subjects.map((s) => (
                  <div key={s.subjectId} className="rounded-lg border border-border p-3.5">
                    <p className="font-medium text-foreground">{s.name}</p>
                    <p className="mt-1 flex items-center gap-1.5 text-sm text-foreground-soft">
                      <BookUser className="size-3.5 shrink-0 text-foreground-muted" />
                      {s.teacher ? `${s.teacher.firstName} ${s.teacher.lastName}` : "No teacher assigned yet"}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
