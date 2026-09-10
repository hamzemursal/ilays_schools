"use client";

import { use } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { StaffProfile } from "@/features/staff/staff-details/StaffProfile";

export default function StaffDetailPage({ params }: { params: Promise<{ id: string; staffId: string }> }) {
  const { id: schoolId, staffId } = use(params);

  return (
    <div>
      <PageHeader
        eyebrow="Staff"
        title="Staff profile"
        breadcrumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Staff", href: `/schools/${schoolId}/staff` },
          { label: "Profile" },
        ]}
      />
      <div className="p-4 sm:p-6">
        <StaffProfile schoolId={schoolId} staffId={staffId} />
      </div>
    </div>
  );
}
