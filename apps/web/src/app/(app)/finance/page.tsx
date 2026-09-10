"use client";

import { CentralFinanceDashboard } from "@/features/finance/central/CentralFinanceDashboard";

// Org-wide — gated on finance.central.view (CENTRAL_FINANCE_VIEWER/MANAGER,
// plus SUPER_ADMIN/ORGANIZATION_ADMIN via their all-permissions grant). The
// backend's FinanceDashboardService.getCentralSummary is what actually scopes
// this to the actor's own UserSchool grants — this page never trusts a
// client-supplied school list.
export default function CentralFinancePage() {
  return (
    <CentralFinanceDashboard
      pageTitle="Central Finance"
      breadcrumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "Central Finance" }]}
    />
  );
}
