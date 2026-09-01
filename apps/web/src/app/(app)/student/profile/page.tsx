"use client";

import { useStudentProfile } from "@/features/student-portal/useStudentProfile";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Alert } from "@/components/ui/Alert";
import { SkeletonCards } from "@/components/ui/Skeleton";

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-foreground-muted">{label}</p>
      <p className="mt-1 text-sm text-foreground">{value}</p>
    </div>
  );
}

export default function StudentProfilePage() {
  const { profile, error } = useStudentProfile();

  return (
    <div>
      <PageHeader eyebrow="Student Portal" title="My Profile" description="Your personal and academic information." />

      <div className="space-y-5 p-4 sm:p-6">
        {error ? (
          <Alert tone="danger">{error}</Alert>
        ) : !profile ? (
          <SkeletonCards count={2} />
        ) : (
          <>
            <Card padding="none">
              <CardHeader title="Personal information" />
              <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2">
                <Field label="Full name" value={`${profile.firstName} ${profile.lastName}`} />
                <Field label="Student Login ID" value={profile.loginId} />
                <Field label="Date of birth" value={new Date(profile.dateOfBirth).toLocaleDateString()} />
                <Field label="Gender" value={profile.sex === "MALE" ? "Male" : "Female"} />
              </div>
            </Card>

            <Card padding="none">
              <CardHeader title="Academic information" />
              <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2">
                <Field label="School" value={profile.enrollment.schoolName} />
                <Field label="Academic year" value={profile.enrollment.academicYearName} />
                <Field label="Class" value={profile.enrollment.className} />
                <Field label="Section" value={profile.enrollment.sectionName} />
                <Field label="Roll number" value={profile.enrollment.rollNumber} />
                <Field
                  label="Enrollment status"
                  value={<Badge tone={profile.enrollment.status === "ACTIVE" ? "success" : "neutral"}>{profile.enrollment.status}</Badge>}
                />
              </div>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
