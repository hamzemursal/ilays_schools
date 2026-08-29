"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth, ApiError } from "@/lib/auth-context";
import { api, type Exam, type MyAssignment } from "@/lib/api";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { EmptyState } from "@/components/ui/EmptyState";
import { SkeletonCards } from "@/components/ui/Skeleton";
import { ClipboardCheck, GraduationCap, PenLine } from "lucide-react";

export default function MyClassesPage() {
  const { accessToken } = useAuth();

  const [assignments, setAssignments] = useState<MyAssignment[] | null>(null);
  const [examsBySchool, setExamsBySchool] = useState<Record<string, Exam[]>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken) return;
    api
      .myAssignments(accessToken)
      .then(async (list) => {
        setAssignments(list);
        const schoolIds = [...new Set(list.map((a) => a.schoolId))];
        const entries = await Promise.all(
          schoolIds.map(async (id) => [id, await api.listExams(accessToken, id)] as const),
        );
        setExamsBySchool(Object.fromEntries(entries));
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load your classes"));
  }, [accessToken]);

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div>
      <PageHeader eyebrow="Teaching" title="My classes" breadcrumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "My classes" }]} />

      <div className="p-4 sm:p-6">
        {error ? (
          <Alert tone="danger">{error}</Alert>
        ) : !assignments ? (
          <SkeletonCards count={2} />
        ) : assignments.length === 0 ? (
          <EmptyState icon={GraduationCap} title="No assignments yet" description="Ask your School Admin to assign you to a class and subject." />
        ) : (
          <div className="space-y-3">
            {assignments.map((a) => {
              const matchingExamSubjects = (examsBySchool[a.schoolId] ?? []).flatMap((exam) =>
                exam.examSubjects
                  .filter((es) => es.classId === a.section.class.id && es.subjectId === a.subject.id)
                  .map((es) => ({ examName: exam.name, examSubjectId: es.id })),
              );

              return (
                <Card key={a.id}>
                  <p className="font-medium text-foreground">
                    {a.section.class.name} · {a.section.name}
                  </p>
                  <p className="text-sm text-foreground-soft">
                    {a.subject.name} · {a.academicYear.name}
                  </p>

                  <div className="mt-3 flex flex-wrap gap-2">
                    <Link href={`/schools/${a.schoolId}/sections/${a.section.id}/attendance?date=${today}`}>
                      <Button size="sm" icon={<ClipboardCheck className="size-4" />}>
                        Mark attendance
                      </Button>
                    </Link>
                    {matchingExamSubjects.map((m) => (
                      <Link key={m.examSubjectId} href={`/schools/${a.schoolId}/exam-subjects/${m.examSubjectId}/sections/${a.section.id}/results`}>
                        <Button size="sm" variant="outline" icon={<PenLine className="size-4" />}>
                          Enter marks — {m.examName}
                        </Button>
                      </Link>
                    ))}
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
