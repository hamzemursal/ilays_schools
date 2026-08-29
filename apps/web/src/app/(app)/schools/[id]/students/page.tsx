"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useAuth, ApiError } from "@/lib/auth-context";
import { api, type StudentListItem } from "@/lib/api";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { useToast } from "@/components/ui/Toast";
import { StudentsTable } from "@/features/students/tables/StudentsTable";
import { Download, Upload, UserPlus } from "lucide-react";

export default function StudentsListPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: schoolId } = use(params);
  const { user, accessToken } = useAuth();
  const { show } = useToast();

  const [students, setStudents] = useState<StudentListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    if (!accessToken) return;
    api
      .listStudents(accessToken, schoolId)
      .then(setStudents)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load students"));
  }, [accessToken, schoolId]);

  async function onExport() {
    if (!accessToken) return;
    setExporting(true);
    try {
      await api.exportStudents(accessToken, schoolId);
    } catch (err) {
      show(err instanceof ApiError ? err.message : "Failed to export students", "danger");
    } finally {
      setExporting(false);
    }
  }

  const canCreate = user?.permissions.includes("students.create") ?? false;
  const canImport = user?.permissions.includes("imports.create") ?? false;
  const canExport = user?.permissions.includes("exports.create") ?? false;
  const schoolName = user?.schools.find((s) => s.id === schoolId)?.name ?? "School";

  return (
    <div>
      <PageHeader
        eyebrow="Students"
        title={schoolName}
        breadcrumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "Students" }]}
        actions={
          <>
            {canExport && (
              <Button variant="outline" icon={<Download className="size-4" />} loading={exporting} onClick={onExport}>
                Export
              </Button>
            )}
            {canImport && (
              <Link href={`/schools/${schoolId}/students/import`}>
                <Button variant="outline" icon={<Upload className="size-4" />}>
                  Import
                </Button>
              </Link>
            )}
            {canCreate && (
              <Link href={`/schools/${schoolId}/students/new`}>
                <Button icon={<UserPlus className="size-4" />}>Add student</Button>
              </Link>
            )}
          </>
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
