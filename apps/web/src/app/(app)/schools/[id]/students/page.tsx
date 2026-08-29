"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useAuth, ApiError } from "@/lib/auth-context";
import { api, type StudentListItem } from "@/lib/api";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { StudentsTable } from "@/features/students/tables/StudentsTable";
import { UserPlus } from "lucide-react";

export default function StudentsListPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: schoolId } = use(params);
  const { user, accessToken } = useAuth();

  const [students, setStudents] = useState<StudentListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken) return;
    api
      .listStudents(accessToken, schoolId)
      .then(setStudents)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load students"));
  }, [accessToken, schoolId]);

  const canCreate = user?.permissions.includes("students.create") ?? false;
  const schoolName = user?.schools.find((s) => s.id === schoolId)?.name ?? "School";

  return (
    <div>
      <PageHeader
        eyebrow="Students"
        title={schoolName}
        breadcrumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "Students" }]}
        actions={
          canCreate && (
            <Link href={`/schools/${schoolId}/students/new`}>
              <Button icon={<UserPlus className="size-4" />}>Add student</Button>
            </Link>
          )
        }
      />
      <div className="p-4 sm:p-6">
        {error ? (
          <Alert tone="danger">{error}</Alert>
        ) : (
          accessToken && <StudentsTable schoolId={schoolId} accessToken={accessToken} students={students} />
        )}
      </div>
    </div>
  );
}
