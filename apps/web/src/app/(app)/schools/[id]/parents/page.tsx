"use client";

import { use, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import { useAuth, ApiError } from "@/lib/auth-context";
import { type ParentListItem, type StudentAccess } from "@/lib/api";
import { parentsApi } from "@/features/parents/api";
import { StudentAccessBadge } from "@/features/parents/StudentAccessBadge";
import { relationshipLabel } from "@/features/guardians/relationships";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Alert } from "@/components/ui/Alert";
import { Avatar } from "@/components/ui/Avatar";
import { Select } from "@/components/ui/FormControls";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { UserPlus, UserRoundCheck, UserRoundX, Users, UsersRound } from "lucide-react";

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
  const [accessFilter, setAccessFilter] = useState<StudentAccess | "">("");

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
      if (relationshipFilter && !(p.relationships ?? []).includes(relationshipFilter as never)) return false;
      if (portalFilter === "yes" && !p.hasPortalAccount) return false;
      if (portalFilter === "no" && p.hasPortalAccount) return false;
      if (accessFilter && p.studentAccess !== accessFilter) return false;
      return true;
    });
  }, [parents, statusFilter, relationshipFilter, portalFilter, accessFilter]);

  const counts = useMemo(() => {
    const list = parents ?? [];
    const by = (a: StudentAccess) => list.filter((p) => p.studentAccess === a).length;
    return { total: list.length, active: by("ACTIVE_STUDENT"), former: by("FORMER_STUDENTS_ONLY"), none: by("NO_LINKED_STUDENT") };
  }, [parents]);

  const canCreate = user?.permissions.includes("guardians.manage") ?? false;
  const schoolName = user?.schools.find((s) => s.id === schoolId)?.name ?? "School";
  const pct = (n: number) => (counts.total > 0 ? `${Math.round((n / counts.total) * 1000) / 10}%` : "—");

  const columns: Column<ParentListItem>[] = [
    {
      key: "name",
      header: "Parent",
      sortValue: (p) => `${p.lastName} ${p.firstName}`,
      render: (p) => (
        <div className="flex items-center gap-3">
          <Avatar name={`${p.firstName} ${p.lastName}`} size="sm" />
          <div className="min-w-0">
            <p className="truncate font-medium text-foreground">
              {p.firstName} {p.lastName}
            </p>
            {p.guardianCode && <p className="font-mono text-xs text-foreground-muted">{p.guardianCode}</p>}
          </div>
        </div>
      ),
    },
    {
      key: "contact",
      header: "Contact",
      render: (p) =>
        !p.phone && !p.email ? (
          <span className="text-foreground-muted">—</span>
        ) : (
          <div className="text-sm leading-tight">
            {p.phone && <p className="text-foreground">{p.phone}</p>}
            {p.email && <p className="text-xs text-foreground-muted">{p.email}</p>}
          </div>
        ),
    },
    {
      key: "children",
      header: "Children",
      sortValue: (p) => p.activeChildren * 1000 + p.formerChildren,
      render: (p) =>
        p.activeChildren + p.formerChildren === 0 ? (
          <span className="text-foreground-muted">None</span>
        ) : (
          <div className="text-sm leading-tight">
            <p className="font-medium tabular-nums text-foreground">{p.activeChildren} active</p>
            {p.formerChildren > 0 && <p className="text-xs tabular-nums text-foreground-muted">{p.formerChildren} former</p>}
          </div>
        ),
    },
    {
      key: "studentAccess",
      header: "Student Access",
      sortValue: (p) => p.studentAccess,
      render: (p) => <StudentAccessBadge access={p.studentAccess} />,
    },
    {
      key: "relationship",
      header: "Relationship",
      render: (p) => {
        const rels = p.relationships ?? [];
        return rels.length === 0 ? <span className="text-foreground-muted">—</span> : rels.map(relationshipLabel).join(", ");
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

  const toggleAccess = (a: StudentAccess | "") => setAccessFilter((cur) => (cur === a ? "" : a));

  return (
    <div>
      <PageHeader
        variant="plain"
        eyebrow="Parents"
        title="Parents"
        description={`Parent accounts and their children at ${schoolName}.`}
        breadcrumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "Parents" }]}
        actions={
          canCreate && (
            <Link href={`/schools/${schoolId}/parents/new`}>
              <Button icon={<UserPlus className="size-4" />}>Add Parent</Button>
            </Link>
          )
        }
      />

      <div className="space-y-5 px-3 pb-8 pt-4 sm:px-5">
        {error ? (
          <Alert tone="danger">{error}</Alert>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
              <AccessCard
                icon={Users}
                tone="bg-accent-soft text-accent"
                label="Total Parents"
                value={parents ? counts.total : "—"}
                active={accessFilter === ""}
                onClick={() => setAccessFilter("")}
              />
              <AccessCard
                icon={UserRoundCheck}
                tone="bg-success-soft text-success"
                label="With Active Students"
                value={parents ? counts.active : "—"}
                hint={pct(counts.active)}
                active={accessFilter === "ACTIVE_STUDENT"}
                onClick={() => toggleAccess("ACTIVE_STUDENT")}
              />
              <AccessCard
                icon={UsersRound}
                tone="bg-warning-soft text-warning"
                label="Former Students Only"
                value={parents ? counts.former : "—"}
                hint={pct(counts.former)}
                active={accessFilter === "FORMER_STUDENTS_ONLY"}
                onClick={() => toggleAccess("FORMER_STUDENTS_ONLY")}
              />
              <AccessCard
                icon={UserRoundX}
                tone="bg-danger-soft text-danger"
                label="No Linked Students"
                value={parents ? counts.none : "—"}
                hint={pct(counts.none)}
                active={accessFilter === "NO_LINKED_STUDENT"}
                onClick={() => toggleAccess("NO_LINKED_STUDENT")}
              />
            </div>

            <div className="rounded-2xl border border-border bg-background p-4 shadow-sm">
              <DataTable
                data={filtered}
                loading={!parents}
                columns={columns}
                rowKey={(p) => p.id}
                onRowClick={(p) => router.push(`/schools/${schoolId}/parents/${p.id}`)}
                searchPlaceholder="Search by name, phone, email…"
                searchFilter={(p, q) => `${p.firstName} ${p.lastName} ${p.phone ?? ""} ${p.email ?? ""}`.toLowerCase().includes(q)}
                emptyTitle={parents && parents.length > 0 ? "No parents match these filters" : "No parents yet"}
                emptyDescription={
                  parents && parents.length > 0
                    ? "Try clearing a filter."
                    : "Parents are added while creating a student, or from Add Parent above."
                }
                toolbar={
                  <div className="grid w-full grid-cols-2 gap-2 lg:w-auto lg:min-w-0 lg:flex-1 lg:grid-cols-4 [&>*]:min-w-0">
                    <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} aria-label="Status">
                      <option value="">All statuses</option>
                      <option value="ACTIVE">Active</option>
                      <option value="ARCHIVED">Archived</option>
                    </Select>
                    <Select value={relationshipFilter} onChange={(e) => setRelationshipFilter(e.target.value)} aria-label="Relationship">
                      <option value="">All relationships</option>
                      <option value="FATHER">Father</option>
                      <option value="MOTHER">Mother</option>
                      <option value="GUARDIAN">Guardian</option>
                      <option value="OTHER">Other</option>
                    </Select>
                    <Select value={portalFilter} onChange={(e) => setPortalFilter(e.target.value)} aria-label="Portal account">
                      <option value="">Any portal account</option>
                      <option value="yes">Has portal account</option>
                      <option value="no">No portal account</option>
                    </Select>
                    <Select
                      value={accessFilter}
                      onChange={(e) => setAccessFilter(e.target.value as StudentAccess | "")}
                      aria-label="Student access"
                    >
                      <option value="">All student access</option>
                      <option value="ACTIVE_STUDENT">Active Student</option>
                      <option value="FORMER_STUDENTS_ONLY">Former Students Only</option>
                      <option value="NO_LINKED_STUDENT">No Linked Student</option>
                    </Select>
                  </div>
                }
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// A summary tile that doubles as a quick Student Access filter.
function AccessCard({
  icon: Icon,
  tone,
  label,
  value,
  hint,
  active,
  onClick,
}: {
  icon: LucideIcon;
  tone: string;
  label: string;
  value: React.ReactNode;
  hint?: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex flex-col items-start gap-3 rounded-2xl border bg-background p-4 text-left shadow-sm sm:flex-row sm:items-center sm:gap-4 transition-all hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
        active ? "border-accent ring-1 ring-accent/30" : "border-border"
      }`}
    >
      <span className={`flex size-12 shrink-0 items-center justify-center rounded-2xl ${tone}`}>
        <Icon className="size-6" />
      </span>
      <div className="min-w-0">
        <p className="text-sm leading-snug text-foreground-soft">{label}</p>
        <p className="text-2xl font-semibold tabular-nums text-foreground">{value}</p>
        {hint && <p className="text-xs tabular-nums text-foreground-muted">{hint}</p>}
      </div>
    </button>
  );
}
