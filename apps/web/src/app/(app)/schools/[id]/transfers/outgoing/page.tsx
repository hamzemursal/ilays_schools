"use client";

import { use } from "react";
import { TransferListExplorer } from "@/features/transfers/TransferListExplorer";

export default function OutgoingTransfersPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: schoolId } = use(params);

  return (
    <TransferListExplorer
      direction="outgoing"
      fixedSchoolId={schoolId}
      pageTitle="Outgoing Transfers"
      breadcrumbs={[
        { label: "Dashboard", href: "/dashboard" },
        { label: "Transfers", href: `/schools/${schoolId}/transfers` },
        { label: "Outgoing" },
      ]}
    />
  );
}
