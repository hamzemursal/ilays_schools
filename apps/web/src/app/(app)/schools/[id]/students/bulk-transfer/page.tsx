"use client";

import { use } from "react";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { BulkTransferWizard } from "@/features/transfers/BulkTransferWizard";

export default function BulkTransferPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: schoolId } = use(params);
  const { user } = useAuth();
  const searchParams = useSearchParams();
  const schoolName = user?.schools.find((s) => s.id === schoolId)?.name ?? "School";
  const studentIds = (searchParams.get("studentIds") ?? "").split(",").filter(Boolean);

  return (
    <div>
      <PageHeader
        eyebrow="Transfers"
        title="Bulk Transfer"
        description="Transfer many students to another school in one action — only available when you have access to both schools."
        breadcrumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Students", href: `/schools/${schoolId}/students` },
          { label: "Bulk Transfer" },
        ]}
      />
      <div className="mx-auto max-w-3xl p-4 sm:p-6">
        {studentIds.length === 0 ? (
          <EmptyState
            title="No students selected"
            description="Go back to the Students list, select the students you want to transfer, then click Bulk Transfer."
          />
        ) : (
          <BulkTransferWizard schoolId={schoolId} schoolName={schoolName} studentIds={studentIds} />
        )}
      </div>
    </div>
  );
}
