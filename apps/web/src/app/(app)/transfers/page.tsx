"use client";

import { TransferListExplorer } from "@/features/transfers/TransferListExplorer";

// Org-wide — Super Admin/Organization Admin only (gated in nav-config.ts).
// No direction filter here: "incoming"/"outgoing" only means something
// relative to one school, so the org-wide view instead offers Origin
// School / Destination School filters (see TransferListExplorer).
export default function OrgTransfersPage() {
  return (
    <TransferListExplorer
      pageTitle="All Transfers"
      breadcrumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "Transfers" }]}
    />
  );
}
