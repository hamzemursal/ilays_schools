"use client";

import { use, useEffect, useState } from "react";
import { useAuth, ApiError } from "@/lib/auth-context";
import { api, type AuditLogEntry } from "@/lib/api";
import { PageHeader } from "@/components/ui/PageHeader";
import { Badge } from "@/components/ui/Badge";
import { Alert } from "@/components/ui/Alert";
import { DataTable, type Column } from "@/components/ui/DataTable";

export default function AuditLogPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: schoolId } = use(params);
  const { user, accessToken } = useAuth();

  const [logs, setLogs] = useState<AuditLogEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken) return;
    api
      .listAuditLogs(accessToken, schoolId)
      .then(setLogs)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load audit log"));
  }, [accessToken, schoolId]);

  const schoolName = user?.schools.find((s) => s.id === schoolId)?.name ?? "School";

  const columns: Column<AuditLogEntry>[] = [
    {
      key: "when",
      header: "When",
      sortValue: (l) => new Date(l.createdAt).getTime(),
      render: (l) => <span className="whitespace-nowrap text-foreground-soft">{new Date(l.createdAt).toLocaleString()}</span>,
    },
    { key: "actor", header: "Actor", sortValue: (l) => l.actorEmail, render: (l) => l.actorEmail },
    {
      key: "action",
      header: "Action",
      sortValue: (l) => l.action,
      render: (l) => <Badge tone="accent">{l.action}</Badge>,
    },
    {
      key: "target",
      header: "Target",
      render: (l) => (
        <span className="text-foreground-soft">
          {l.resource} · {l.resourceId ?? "—"}
        </span>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        eyebrow="Audit log"
        title={schoolName}
        breadcrumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "Audit log" }]}
      />

      <div className="p-4 sm:p-6">
        {error ? (
          <Alert tone="danger">{error}</Alert>
        ) : (
          <DataTable
            data={logs}
            columns={columns}
            rowKey={(l) => l.id}
            searchPlaceholder="Search by action, actor, or target…"
            searchFilter={(l, q) => `${l.action} ${l.actorEmail} ${l.resource} ${l.resourceId ?? ""}`.toLowerCase().includes(q)}
            emptyTitle="No audit events yet"
            emptyDescription="Sensitive actions taken in this school will show up here."
          />
        )}
      </div>
    </div>
  );
}
