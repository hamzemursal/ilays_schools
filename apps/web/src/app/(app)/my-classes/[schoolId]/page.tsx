"use client";

import { use, useEffect, useState } from "react";
import { useAuth, ApiError } from "@/lib/auth-context";
import { api, type Teacher } from "@/lib/api";
import { groupAssignmentsBySchool } from "@/features/my-classes/schoolGrouping";
import { SchoolTypeBadge } from "@/features/my-classes/components/SchoolTypeBadge";
import { SchoolSwitcher } from "@/features/my-classes/components/SchoolSwitcher";
import { SchoolClassesAndSubjects } from "@/features/my-classes/components/SchoolClassesAndSubjects";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Alert } from "@/components/ui/Alert";
import { EmptyState } from "@/components/ui/EmptyState";
import { SkeletonCards } from "@/components/ui/Skeleton";
import { GraduationCap } from "lucide-react";

export default function MySchoolPage({ params }: { params: Promise<{ schoolId: string }> }) {
  const { schoolId } = use(params);
  const { accessToken, user } = useAuth();

  const [teacher, setTeacher] = useState<Teacher | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken) return;
    api
      .getMyTeacherProfile(accessToken)
      .then(setTeacher)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load your profile"));
  }, [accessToken]);

  const canMarkAttendance = user?.permissions.includes("attendance.mark") ?? false;

  if (error) {
    return (
      <div className="p-4 sm:p-6">
        <Alert tone="danger">{error}</Alert>
      </div>
    );
  }
  if (teacher === undefined) return <SkeletonCards count={3} />;
  if (teacher === null) {
    return (
      <div className="p-4 sm:p-6">
        <EmptyState icon={GraduationCap} title="No teacher profile" description="This account isn't linked to a teacher profile." />
      </div>
    );
  }

  const schools = groupAssignmentsBySchool(teacher.assignments);
  const school = schools.find((s) => s.id === schoolId);

  if (!school) {
    return (
      <div>
        <PageHeader
          eyebrow="Teaching"
          title="Not assigned to this school"
          breadcrumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "My classes", href: "/my-classes" }, { label: "Unknown school" }]}
        />
        <div className="p-4 sm:p-6">
          <EmptyState
            icon={GraduationCap}
            title="Not assigned to this school"
            description="You don't have any classes or subjects assigned at this school."
          />
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        eyebrow="Teaching"
        title={school.name}
        breadcrumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "My classes", href: "/my-classes" }, { label: school.name }]}
        actions={
          <div className="flex items-center gap-2">
            <SchoolTypeBadge type={school.type} />
            {schools.length > 1 && <SchoolSwitcher schools={schools} currentSchoolId={schoolId} />}
          </div>
        }
      />

      <div className="space-y-5 p-4 sm:p-6">
        <div className="grid grid-cols-3 gap-3">
          <Card padding="sm" className="text-center">
            <p className="text-2xl font-semibold text-foreground">{school.classCount}</p>
            <p className="text-xs font-medium uppercase tracking-wide text-foreground-muted">Classes</p>
          </Card>
          <Card padding="sm" className="text-center">
            <p className="text-2xl font-semibold text-foreground">{school.sectionCount}</p>
            <p className="text-xs font-medium uppercase tracking-wide text-foreground-muted">Sections</p>
          </Card>
          <Card padding="sm" className="text-center">
            <p className="text-2xl font-semibold text-foreground">{school.subjectCount}</p>
            <p className="text-xs font-medium uppercase tracking-wide text-foreground-muted">Subjects</p>
          </Card>
        </div>

        <SchoolClassesAndSubjects school={school} schoolId={schoolId} canMarkAttendance={canMarkAttendance} />
      </div>
    </div>
  );
}
