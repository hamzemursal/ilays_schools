"use client";

import { use, useEffect, useState } from "react";
import { UserPlus, X } from "lucide-react";
import { useAuth, ApiError } from "@/lib/auth-context";
import type { Teacher } from "@/lib/api";
import { teachersApi } from "@/features/teachers/api";
import { TeachersTable } from "@/features/teachers/tables/TeachersTable";
import { TeacherForm } from "@/features/teachers/forms/TeacherForm";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { Card } from "@/components/ui/Card";

export default function TeachersListPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: schoolId } = use(params);
  const { user, accessToken } = useAuth();

  const [teachers, setTeachers] = useState<Teacher[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    if (!accessToken) return;
    teachersApi
      .list(accessToken, schoolId)
      .then(setTeachers)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load teachers"));
  }, [accessToken, schoolId]);

  const canCreate = user?.permissions.includes("teachers.create") ?? false;
  const schoolName = user?.schools.find((s) => s.id === schoolId)?.name ?? "School";

  return (
    <div>
      <PageHeader
        eyebrow="Teachers"
        title={schoolName}
        breadcrumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "Teachers" }]}
        actions={
          canCreate && (
            <Button
              icon={showForm ? <X className="size-4" /> : <UserPlus className="size-4" />}
              variant={showForm ? "outline" : "primary"}
              onClick={() => setShowForm((v) => !v)}
            >
              {showForm ? "Cancel" : "Add teacher"}
            </Button>
          )
        }
      />
      <div className="space-y-5 p-4 sm:p-6">
        {showForm && (
          <Card>
            <TeacherForm
              schoolId={schoolId}
              onCreated={() => {
                setShowForm(false);
                if (accessToken) teachersApi.list(accessToken, schoolId).then(setTeachers);
              }}
            />
          </Card>
        )}
        {error ? <Alert tone="danger">{error}</Alert> : <TeachersTable schoolId={schoolId} teachers={teachers} />}
      </div>
    </div>
  );
}
