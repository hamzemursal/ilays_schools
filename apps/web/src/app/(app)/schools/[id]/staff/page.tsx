"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { UserPlus, Users } from "lucide-react";
import { useAuth, ApiError } from "@/lib/auth-context";
import type { Staff } from "@/lib/api";
import { staffApi } from "@/features/staff/api";
import { AssignExistingStaffForm } from "@/features/staff/forms/AssignExistingStaffForm";
import { StaffTable } from "@/features/staff/tables/StaffTable";
import { DepartmentsManager } from "@/features/staff/departments/DepartmentsManager";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { useToast } from "@/components/ui/Toast";

export default function StaffListPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: schoolId } = use(params);
  const { user, accessToken } = useAuth();
  const { show } = useToast();
  const router = useRouter();

  const [staff, setStaff] = useState<Staff[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [assigningExisting, setAssigningExisting] = useState(false);

  useEffect(() => {
    if (!accessToken) return;
    staffApi
      .list(accessToken, schoolId)
      .then(setStaff)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load staff"));
  }, [accessToken, schoolId]);

  const canCreate = user?.permissions.includes("staff.create") ?? false;
  const canManageDepartments = user?.permissions.includes("departments.manage") ?? false;
  const schoolName = user?.schools.find((s) => s.id === schoolId)?.name ?? "School";

  return (
    <div>
      <PageHeader
        eyebrow="Staff"
        title={schoolName}
        breadcrumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "Staff" }]}
        actions={
          <>
            {canCreate && !assigningExisting && (
              <Button variant="outline" icon={<Users className="size-4" />} onClick={() => setAssigningExisting(true)}>
                Assign existing staff
              </Button>
            )}
            {canCreate && (
              <Link href={`/schools/${schoolId}/staff/new`}>
                <Button icon={<UserPlus className="size-4" />}>Add staff member</Button>
              </Link>
            )}
          </>
        }
      />
      <div className="space-y-5 p-4 sm:p-6">
        {error ? (
          <Alert tone="danger">{error}</Alert>
        ) : (
          accessToken && (
            <>
              {assigningExisting && (
                <AssignExistingStaffForm
                  accessToken={accessToken}
                  schoolId={schoolId}
                  onCancel={() => setAssigningExisting(false)}
                  onAssigned={(staffId) => {
                    setAssigningExisting(false);
                    show("Staff member assigned to this school.");
                    router.push(`/schools/${schoolId}/staff/${staffId}`);
                  }}
                />
              )}
              <StaffTable schoolId={schoolId} staff={staff} loading={!staff} />
            </>
          )
        )}
        {accessToken && <DepartmentsManager accessToken={accessToken} schoolId={schoolId} canManage={canManageDepartments} />}
      </div>
    </div>
  );
}
