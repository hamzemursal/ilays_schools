"use client";

import { use } from "react";
import { useAuth } from "@/lib/auth-context";
import { PageHeader } from "@/components/ui/PageHeader";
import { CreateStaffForm } from "@/features/staff/staff-details/CreateStaffForm";

export default function NewStaffPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: schoolId } = use(params);
  const { accessToken } = useAuth();

  return (
    <div>
      <PageHeader
        eyebrow="Staff"
        title="Add staff member"
        breadcrumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Staff", href: `/schools/${schoolId}/staff` },
          { label: "Add staff member" },
        ]}
      />
      <div className="mx-auto max-w-3xl p-4 sm:p-6">
        {accessToken && <CreateStaffForm accessToken={accessToken} schoolId={schoolId} />}
      </div>
    </div>
  );
}
