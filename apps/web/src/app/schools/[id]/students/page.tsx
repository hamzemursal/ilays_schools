"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth, ApiError } from "@/lib/auth-context";
import { api, type StudentListItem } from "@/lib/api";

export default function StudentsListPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: schoolId } = use(params);
  const router = useRouter();
  const { user, accessToken, loading } = useAuth();

  const [students, setStudents] = useState<StudentListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) router.push("/login");
  }, [loading, user, router]);

  useEffect(() => {
    if (!accessToken) return;
    api
      .listStudents(accessToken, schoolId)
      .then(setStudents)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load students"));
  }, [accessToken, schoolId]);

  if (loading || !user) return <p className="p-8 text-foreground-soft">Loading…</p>;
  if (error) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-16">
        <p className="rounded-lg bg-danger-soft px-4 py-3 text-danger">{error}</p>
      </div>
    );
  }

  const canCreate = user.permissions.includes("students.create");
  const schoolName = user.schools.find((s) => s.id === schoolId)?.name ?? "School";

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-16">
      <div className="flex items-start justify-between">
        <div>
          <span className="text-sm font-semibold uppercase tracking-wide text-accent">Students</span>
          <h1 className="mt-1 text-2xl font-semibold text-foreground">{schoolName}</h1>
        </div>
        {canCreate && (
          <Link
            href={`/schools/${schoolId}/students/new`}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90"
          >
            Add student
          </Link>
        )}
      </div>

      <div className="mt-6 overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-left text-sm">
          <thead className="bg-surface text-foreground-soft">
            <tr>
              <th className="px-4 py-2 font-medium">Student #</th>
              <th className="px-4 py-2 font-medium">Name</th>
              <th className="px-4 py-2 font-medium">Class</th>
              <th className="px-4 py-2 font-medium">Section</th>
              <th className="px-4 py-2 font-medium">Roll #</th>
            </tr>
          </thead>
          <tbody>
            {students?.map((s) => (
              <tr key={s.enrollmentId} className="border-t border-border">
                <td className="px-4 py-2 font-mono text-foreground-soft">{s.studentNumber}</td>
                <td className="px-4 py-2 text-foreground">
                  {s.firstName} {s.lastName}
                </td>
                <td className="px-4 py-2 text-foreground-soft">{s.className}</td>
                <td className="px-4 py-2 text-foreground-soft">{s.sectionName}</td>
                <td className="px-4 py-2 text-foreground-soft">{s.rollNumber}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {students?.length === 0 && (
          <p className="p-4 text-sm text-foreground-soft">No students enrolled yet.</p>
        )}
      </div>
    </div>
  );
}
