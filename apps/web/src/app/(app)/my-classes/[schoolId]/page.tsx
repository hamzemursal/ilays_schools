"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth, ApiError } from "@/lib/auth-context";
import { api, type Teacher, type TeacherAssignmentRecord } from "@/lib/api";
import {
  groupAssignmentsBySchool,
  groupAssignmentsBySubject,
  groupAssignmentsByYear,
} from "@/features/my-classes/schoolGrouping";
import { SchoolTypeBadge } from "@/features/my-classes/components/SchoolTypeBadge";
import { SchoolSwitcher } from "@/features/my-classes/components/SchoolSwitcher";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { EmptyState } from "@/components/ui/EmptyState";
import { SkeletonCards } from "@/components/ui/Skeleton";
import { ClipboardCheck, GraduationCap } from "lucide-react";

export default function MySchoolPage({ params }: { params: Promise<{ schoolId: string }> }) {
  const { schoolId } = use(params);
  const { accessToken, user } = useAuth();
  const router = useRouter();

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

  const byYear = groupAssignmentsByYear(school.assignments);
  const bySubject = groupAssignmentsBySubject(school.assignments);
  const today = new Date().toISOString().slice(0, 10);

  function attendanceUrl(a: TeacherAssignmentRecord) {
    const p = new URLSearchParams({
      date: today,
      year: a.academicYear.name,
      class: a.section.class.name,
      section: a.section.name,
      subject: a.subject.name,
    });
    return `/schools/${a.schoolId}/sections/${a.section.id}/attendance?${p.toString()}`;
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

        <Card padding="none">
          <CardHeader title="My classes" description={`Every class and section you teach at ${school.name}, by academic year.`} />
          <div className="space-y-4 p-5">
            {byYear.map((yearGroup) => (
              <div key={yearGroup.academicYearId}>
                <p className="text-xs font-semibold uppercase tracking-wide text-foreground-muted">{yearGroup.academicYearName}</p>
                <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {yearGroup.assignments.map((a) => (
                    <Card
                      key={a.id}
                      padding="sm"
                      className="cursor-pointer transition-colors hover:border-accent"
                      onClick={() => router.push(`/my-classes/${schoolId}/${a.id}`)}
                    >
                      <p className="font-medium text-foreground">
                        {a.section.class.name} · {a.section.name}
                      </p>
                      <p className="text-sm text-foreground-soft">{a.subject.name}</p>
                      {canMarkAttendance && (
                        <Link href={attendanceUrl(a)} onClick={(e) => e.stopPropagation()} className="mt-2 inline-flex">
                          <Button size="sm" variant="outline" icon={<ClipboardCheck className="size-4" />}>
                            Mark attendance
                          </Button>
                        </Link>
                      )}
                    </Card>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card padding="none">
          <CardHeader title="My subjects" description={`Every subject you teach at ${school.name}, across your classes.`} />
          <div className="space-y-4 p-5">
            {bySubject.map((subjectGroup) => (
              <div key={subjectGroup.subjectId}>
                <p className="text-xs font-semibold uppercase tracking-wide text-foreground-muted">{subjectGroup.subjectName}</p>
                <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {subjectGroup.assignments.map((a) => (
                    <Card
                      key={a.id}
                      padding="sm"
                      className="cursor-pointer transition-colors hover:border-accent"
                      onClick={() => router.push(`/my-classes/${schoolId}/${a.id}`)}
                    >
                      <p className="font-medium text-foreground">
                        {a.section.class.name} · {a.section.name}
                      </p>
                      <p className="text-sm text-foreground-soft">{a.academicYear.name}</p>
                    </Card>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
