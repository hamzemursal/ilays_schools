"use client";

import { use } from "react";
import { TransferListExplorer } from "@/features/transfers/TransferListExplorer";

export default function IncomingTransfersPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: schoolId } = use(params);

  return (
    <TransferListExplorer
      direction="incoming"
      fixedSchoolId={schoolId}
      pageTitle="Incoming Transfers"
      breadcrumbs={[
        { label: "Dashboard", href: "/dashboard" },
        { label: "Transfers", href: `/schools/${schoolId}/transfers` },
        { label: "Incoming" },
      ]}
    />
  );
}
