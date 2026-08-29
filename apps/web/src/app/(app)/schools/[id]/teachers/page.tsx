"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { Download, UserPlus } from "lucide-react";
import { useAuth, ApiError } from "@/lib/auth-context";
import { api, type Teacher } from "@/lib/api";
import { teachersApi } from "@/features/teachers/api";
import { TeachersTable } from "@/features/teachers/tables/TeachersTable";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { useToast } from "@/components/ui/Toast";

export default function TeachersListPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: schoolId } = use(params);
  const { user, accessToken } = useAuth();
  const { show } = useToast();

  const [teachers, setTeachers] = useState<Teacher[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    if (!accessToken) return;
    teachersApi
      .list(accessToken, schoolId)
      .then(setTeachers)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load teachers"));
  }, [accessToken, schoolId]);

  async function onExport() {
    if (!accessToken) return;
    setExporting(true);
    try {
      await api.exportTeachers(accessToken, schoolId);
    } catch (err) {
      show(err instanceof ApiError ? err.message : "Failed to export teachers", "danger");
    } finally {
      setExporting(false);
    }
  }

  const canCreate = user?.permissions.includes("teachers.create") ?? false;
  const canExport = user?.permissions.includes("exports.create") ?? false;
  const schoolName = user?.schools.find((s) => s.id === schoolId)?.name ?? "School";

  return (
    <div>
      <PageHeader
        eyebrow="Teachers"
        title={schoolName}
        breadcrumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "Teachers" }]}
        actions={
          <>
            {canExport && (
              <Button variant="outline" icon={<Download className="size-4" />} loading={exporting} onClick={onExport}>
                Export
              </Button>
            )}
            {canCreate && (
              <Link href={`/schools/${schoolId}/teachers/new`}>
                <Button icon={<UserPlus className="size-4" />}>Add teacher</Button>
              </Link>
            )}
          </>
        }
      />
      <div className="space-y-5 p-4 sm:p-6">
        {error ? <Alert tone="danger">{error}</Alert> : <TeachersTable schoolId={schoolId} teachers={teachers} />}
      </div>
    </div>
  );
}
