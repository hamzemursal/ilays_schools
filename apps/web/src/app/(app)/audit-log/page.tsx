"use client";

import { AuditLogExplorer } from "@/features/audit-log/AuditLogExplorer";

// Org-wide — Super Admin/Organization Admin only (gated in nav-config.ts on
// the same schools.view permission as the "Schools" link; the backend's own
// scoping in AuditService.list is what actually enforces this, not this
// page). A School Admin who somehow reaches this URL still only ever sees
// their own school's events, same as the per-school page.
export default function OrgAuditLogPage() {
  return (
    <AuditLogExplorer pageTitle="All Schools" breadcrumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "Audit log" }]} />
  );
}
