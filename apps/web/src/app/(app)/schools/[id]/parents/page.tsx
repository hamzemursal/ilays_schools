"use client";

import { use, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth, ApiError } from "@/lib/auth-context";
import { type ParentListItem } from "@/lib/api";
import { parentsApi } from "@/features/parents/api";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Alert } from "@/components/ui/Alert";
import { Select } from "@/components/ui/FormControls";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { UserPlus } from "lucide-react";

const PORTAL_TONE: Record<string, "success" | "warning" | "neutral"> = {
  ACTIVE: "success",
  PENDING_SETUP: "warning",
  SUSPENDED: "neutral",
};

export default function ParentsListPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: schoolId } = use(params);
  const { user, accessToken } = useAuth();
  const router = useRouter();

  const [parents, setParents] = useState<ParentListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("");
  const [relationshipFilter, setRelationshipFilter] = useState("");
  const [portalFilter, setPortalFilter] = useState("");

  useEffect(() => {
    if (!accessToken) return;
    parentsApi
      .list(accessToken, schoolId)
      .then(setParents)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load parents"));
  }, [accessToken, schoolId]);

  const filtered = useMemo(() => {
    if (!parents) return null;
    return parents.filter((p) => {
      if (statusFilter && p.status !== statusFilter) return false;
      if (relationshipFilter && !p.children.some((c) => c.relationship === relationshipFilter)) return false;
      if (portalFilter === "yes" && !p.hasPortalAccount) return false;
      if (portalFilter === "no" && p.hasPortalAccount) return false;
      return true;
    });
  }, [parents, statusFilter, relationshipFilter, portalFilter]);

  const canCreate = user?.permissions.includes("guardians.manage") ?? false;
  const schoolName = user?.schools.find((s) => s.id === schoolId)?.name ?? "School";

  const columns: Column<ParentListItem>[] = [
    {
      key: "name",
      header: "Parent",
      sortValue: (p) => `${p.lastName} ${p.firstName}`,
      render: (p) => (
        <div>
          <p className="font-medium text-foreground">
            {p.firstName} {p.lastName}
          </p>
          {p.guardianCode && <p className="font-mono text-xs text-foreground-muted">{p.guardianCode}</p>}
        </div>
      ),
    },
    { key: "phone", header: "Phone", render: (p) => p.phone ?? <span className="text-foreground-muted">—</span> },
    { key: "email", header: "Email", render: (p) => p.email ?? <span className="text-foreground-muted">—</span> },
    {
      key: "children",
      header: "Children",
      sortValue: (p) => p.children.length,
      render: (p) =>
        p.children.length === 0 ? (
          <span className="text-foreground-muted">None</span>
        ) : (
          <span>{p.children.length}</span>
        ),
    },
    {
      key: "relationship",
      header: "Relationship",
      render: (p) => {
        const rels = Array.from(new Set(p.children.map((c) => c.relationship)));
        return rels.length === 0 ? <span className="text-foreground-muted">—</span> : rels.join(", ");
      },
    },
    {
      key: "portal",
      header: "Portal Account",
      render: (p) =>
        p.hasPortalAccount && p.portalAccountStatus ? (
          <Badge tone={PORTAL_TONE[p.portalAccountStatus] ?? "neutral"}>{p.portalAccountStatus.replace("_", " ")}</Badge>
        ) : (
          <Badge tone="neutral">None</Badge>
        ),
    },
    {
      key: "status",
      header: "Status",
      sortValue: (p) => p.status,
      render: (p) => <Badge tone={p.status === "ACTIVE" ? "success" : "neutral"}>{p.status}</Badge>,
    },
    {
      key: "actions",
      header: "",
      headerClassName: "text-right",
      className: "text-right",
      render: (p) => (
        <div className="flex justify-end gap-2" onClick={(e) => e.stopPropagation()}>
          <Link href={`/schools/${schoolId}/parents/${p.id}`}>
            <Button size="sm" variant="outline">
              View
            </Button>
          </Link>
          <Link href={`/schools/${schoolId}/parents/${p.id}?edit=1`}>
            <Button size="sm" variant="ghost">
              Edit
            </Button>
          </Link>
        </div>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        eyebrow="Parents"
        title={schoolName}
        breadcrumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "Parents" }]}
        actions={
          canCreate && (
            <Link href={`/schools/${schoolId}/parents/new`}>
              <Button icon={<UserPlus className="size-4" />}>Add Parent</Button>
            </Link>
          )
        }
      />
      <div className="p-4 sm:p-6">
        {error ? (
          <Alert tone="danger">{error}</Alert>
        ) : (
          <DataTable
            data={filtered}
            loading={!parents}
            columns={columns}
            rowKey={(p) => p.id}
            onRowClick={(p) => router.push(`/schools/${schoolId}/parents/${p.id}`)}
            searchPlaceholder="Search by name, phone, email…"
            searchFilter={(p, q) => `${p.firstName} ${p.lastName} ${p.phone ?? ""} ${p.email ?? ""}`.toLowerCase().includes(q)}
            emptyTitle="No parents yet"
            emptyDescription="Parents are added while creating a student, or from Add Parent above."
            toolbar={
              <div className="flex flex-wrap items-center gap-2">
                <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="w-auto">
                  <option value="">All statuses</option>
                  <option value="ACTIVE">Active</option>
                  <option value="ARCHIVED">Archived</option>
                </Select>
                <Select value={relationshipFilter} onChange={(e) => setRelationshipFilter(e.target.value)} className="w-auto">
                  <option value="">All relationships</option>
                  <option value="FATHER">Father</option>
                  <option value="MOTHER">Mother</option>
                  <option value="GUARDIAN">Guardian</option>
                  <option value="OTHER">Other</option>
                </Select>
                <Select value={portalFilter} onChange={(e) => setPortalFilter(e.target.value)} className="w-auto">
                  <option value="">Any portal account</option>
                  <option value="yes">Has portal account</option>
                  <option value="no">No portal account</option>
                </Select>
              </div>
            }
          />
        )}
      </div>
    </div>
  );
}
