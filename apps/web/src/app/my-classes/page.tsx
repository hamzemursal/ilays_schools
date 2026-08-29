"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth, ApiError } from "@/lib/auth-context";
import { api, type Exam, type MyAssignment } from "@/lib/api";

export default function MyClassesPage() {
  const router = useRouter();
  const { user, accessToken, loading } = useAuth();

  const [assignments, setAssignments] = useState<MyAssignment[] | null>(null);
  const [examsBySchool, setExamsBySchool] = useState<Record<string, Exam[]>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) router.push("/login");
  }, [loading, user, router]);

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

  if (loading || !user) return <p className="p-8 text-foreground-soft">Loading…</p>;
  if (error) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 sm:px-6">
        <p className="rounded-lg bg-danger-soft px-4 py-3 text-danger">{error}</p>
      </div>
    );
  }
  if (!assignments) return <p className="p-8 text-foreground-soft">Loading…</p>;

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-10 sm:px-6 sm:py-16">
      <span className="text-sm font-semibold uppercase tracking-wide text-accent">Teaching</span>
      <h1 className="mt-1 text-2xl font-semibold text-foreground">My classes</h1>

      {assignments.length === 0 && (
        <p className="mt-6 text-sm text-foreground-soft">
          No assignments yet — ask your School Admin to assign you to a class and subject.
        </p>
      )}

      <div className="mt-6 space-y-3">
        {assignments.map((a) => {
          const matchingExamSubjects = (examsBySchool[a.schoolId] ?? []).flatMap((exam) =>
            exam.examSubjects
              .filter((es) => es.classId === a.section.class.id && es.subjectId === a.subject.id)
              .map((es) => ({ examName: exam.name, examSubjectId: es.id })),
          );

          return (
            <div key={a.id} className="rounded-xl border border-border bg-surface p-4 sm:p-5">
              <p className="font-medium text-foreground">
                {a.section.class.name} · {a.section.name}
              </p>
              <p className="text-sm text-foreground-soft">
                {a.subject.name} · {a.academicYear.name}
              </p>

              <div className="mt-3 flex flex-wrap gap-2">
                <Link
                  href={`/schools/${a.schoolId}/sections/${a.section.id}/attendance?date=${today}`}
                  className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white hover:opacity-90"
                >
                  Mark attendance
                </Link>
                {matchingExamSubjects.map((m) => (
                  <Link
                    key={m.examSubjectId}
                    href={`/schools/${a.schoolId}/exam-subjects/${m.examSubjectId}/sections/${a.section.id}/results`}
                    className="rounded-lg border border-border px-3 py-1.5 text-sm text-foreground hover:border-accent"
                  >
                    Enter marks — {m.examName}
                  </Link>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
