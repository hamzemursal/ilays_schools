"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useAuth, ApiError } from "@/lib/auth-context";
import { api, type MyChildSubject } from "@/lib/api";
import { useStudentProfile } from "@/features/student-portal/useStudentProfile";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardHeader } from "@/components/ui/Card";
import { Alert } from "@/components/ui/Alert";
import { EmptyState } from "@/components/ui/EmptyState";
import { SkeletonCards } from "@/components/ui/Skeleton";
import { BookUser, CalendarDays, GraduationCap } from "lucide-react";

// mySubjects is resolved entirely from the authenticated student's own
// enrollment (see StudentPortalService.mySubjects) — there's no per-subject
// ownership to re-check here, since a subjectId that isn't in this list
// simply won't be found, whether it's mistyped or belongs to another
// class/school/year entirely.
export default function StudentSubjectDetailPage({ params }: { params: Promise<{ subjectId: string }> }) {
  const { subjectId } = use(params);
  const { accessToken } = useAuth();
  const { profile, error: profileError } = useStudentProfile();
  const [subjects, setSubjects] = useState<MyChildSubject[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken || !profile) return;
    api
      .getMyStudentSubjects(accessToken, profile.enrollment.academicYearId)
      .then(setSubjects)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load subject"));
  }, [accessToken, profile]);

  const subject = subjects?.find((s) => s.subjectId === subjectId) ?? null;

  return (
    <div>
      <PageHeader
        eyebrow="Student Portal"
        title={subject?.name ?? "Subject"}
        description={profile ? `${profile.enrollment.className} · Section ${profile.enrollment.sectionName}` : undefined}
        breadcrumbs={[
          { label: "Academics", href: "/student/academics" },
          { label: subject?.name ?? "Subject" },
        ]}
      />

      <div className="space-y-5 p-4 sm:p-6">
        {profileError || error ? (
          <Alert tone="danger">{profileError ?? error}</Alert>
        ) : !profile || !subjects ? (
          <SkeletonCards count={2} />
        ) : !subject ? (
          <Card>
            <EmptyState
              icon={GraduationCap}
              title="Subject not found"
              description="This subject isn't part of your current enrollment."
              action={
                <Link href="/student/academics" className="text-sm font-medium text-accent hover:underline">
                  Back to Academics
                </Link>
              }
            />
          </Card>
        ) : (
          <>
            <Card padding="none">
              <CardHeader title={subject.name} description={subject.code ?? undefined} />
              <div className="flex items-center gap-2 px-5 pb-5 text-sm text-foreground-soft">
                <BookUser className="size-4 shrink-0 text-foreground-muted" />
                {subject.teacher ? `${subject.teacher.firstName} ${subject.teacher.lastName}` : "No teacher assigned yet"}
              </div>
            </Card>

            <Card padding="none">
              <CardHeader
                title="Subject Attendance"
                description="Attendance recorded specifically for this subject, if your school tracks it that way."
              />
              <div className="p-5">
                <EmptyState
                  icon={CalendarDays}
                  title="No subject-level attendance records are available for this subject"
                  description="Your school currently records attendance once per day, not per subject. Your overall daily attendance is available on the Attendance page."
                  action={
                    <Link href="/student/attendance" className="text-sm font-medium text-accent hover:underline">
                      View overall attendance
                    </Link>
                  }
                />
              </div>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
