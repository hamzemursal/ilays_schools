"use client";

import { use, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Check, ChevronRight, Clock, LogIn, LogOut, Search, Users, X, XCircle } from "lucide-react";
import { ApiError, useAuth } from "@/lib/auth-context";
import { api, type Transfer, type TransferStatus } from "@/lib/api";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { EmptyState } from "@/components/ui/EmptyState";
import { SkeletonTable } from "@/components/ui/Skeleton";
import { StatCard } from "@/components/ui/StatCard";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Input, Select } from "@/components/ui/FormControls";
import { useToast } from "@/components/ui/Toast";
import { ApproveTransferForm } from "@/features/transfers/components/ApproveTransferForm";

const STATUS_TONE: Record<TransferStatus, "warning" | "success" | "danger" | "accent" | "neutral"> = {
  REQUESTED: "warning",
  APPROVED: "accent",
  EXECUTED: "success",
  REJECTED: "danger",
  CANCELLED: "neutral",
};

type TabKey = "ALL" | "INCOMING" | "OUTGOING";
const TABS: { key: TabKey; label: string }[] = [
  { key: "ALL", label: "All Transfers" },
  { key: "INCOMING", label: "Incoming Transfers" },
  { key: "OUTGOING", label: "Outgoing Transfers" },
];

export default function TransfersPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: schoolId } = use(params);
  const { user, accessToken } = useAuth();
  const { show } = useToast();

  const [transfers, setTransfers] = useState<Transfer[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);

  const [tab, setTab] = useState<TabKey>("ALL");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<TransferStatus | "ALL">("ALL");

  useEffect(() => {
    if (!accessToken) return;
    api
      .listTransfers(accessToken, schoolId)
      .then(setTransfers)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load transfers"));
  }, [accessToken, schoolId]);

  const canApprove = user?.permissions.includes("transfers.approve") ?? false;
  const canCreate = user?.permissions.includes("transfers.create") ?? false;
  const schoolName = user?.schools.find((s) => s.id === schoolId)?.name ?? "School";

  async function onReject() {
    if (!accessToken || !rejectingId) return;
    setRejecting(true);
    try {
      const updated = await api.rejectTransfer(accessToken, rejectingId);
      setTransfers((prev) => prev?.map((t) => (t.id === updated.id ? updated : t)) ?? prev);
      show("Transfer rejected.");
    } catch (err) {
      show(err instanceof ApiError ? err.message : "Failed to reject transfer", "danger");
    } finally {
      setRejecting(false);
      setRejectingId(null);
    }
  }

  async function onCancel() {
    if (!accessToken || !cancellingId) return;
    setCancelling(true);
    try {
      const updated = await api.cancelTransfer(accessToken, cancellingId);
      setTransfers((prev) => prev?.map((t) => (t.id === updated.id ? updated : t)) ?? prev);
      show("Transfer request cancelled.");
    } catch (err) {
      show(err instanceof ApiError ? err.message : "Failed to cancel transfer", "danger");
    } finally {
      setCancelling(false);
      setCancellingId(null);
    }
  }

  const summary = useMemo(() => {
    const list = transfers ?? [];
    return {
      total: list.length,
      pending: list.filter((t) => t.status === "REQUESTED").length,
      executed: list.filter((t) => t.status === "EXECUTED").length,
      incoming: list.filter((t) => t.toSchoolId === schoolId).length,
      outgoing: list.filter((t) => t.fromSchoolId === schoolId).length,
    };
  }, [transfers, schoolId]);

  const filtered = useMemo(() => {
    if (!transfers) return null;
    let list = transfers;
    if (tab === "INCOMING") list = list.filter((t) => t.toSchoolId === schoolId);
    if (tab === "OUTGOING") list = list.filter((t) => t.fromSchoolId === schoolId);
    if (statusFilter !== "ALL") list = list.filter((t) => t.status === statusFilter);
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      list = list.filter(
        (t) =>
          `${t.student.firstName} ${t.student.lastName}`.toLowerCase().includes(q) ||
          t.fromEnrollment.studentNumber.toLowerCase().includes(q) ||
          (t.toEnrollment?.studentNumber.toLowerCase().includes(q) ?? false),
      );
    }
    return list;
  }, [transfers, tab, statusFilter, query, schoolId]);

  return (
    <div>
      <PageHeader
        eyebrow="Transfers"
        title={schoolName}
        description="Students moving between schools in the organization."
        breadcrumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "Transfers" }]}
      />

      <div className="space-y-5 p-4 sm:p-6">
        {error ? (
          <Alert tone="danger">{error}</Alert>
        ) : !transfers ? (
          <SkeletonTable cols={4} />
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              <StatCard icon={Users} label="Total" value={summary.total} tone="neutral" />
              <StatCard icon={Clock} label="Pending" value={summary.pending} tone="warning" />
              <StatCard icon={Check} label="Completed" value={summary.executed} tone="success" />
              <StatCard icon={LogIn} label="Incoming" value={summary.incoming} tone="neutral" />
              <StatCard icon={LogOut} label="Outgoing" value={summary.outgoing} tone="neutral" />
            </div>

            <div className="border-b border-border">
              <div className="flex gap-1 overflow-x-auto">
                {TABS.map((t) => (
                  <button
                    key={t.key}
                    onClick={() => setTab(t.key)}
                    className={`shrink-0 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors ${
                      tab === t.key ? "border-accent text-accent" : "border-transparent text-foreground-soft hover:text-foreground"
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="relative w-full max-w-xs">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-foreground-muted" />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search by student name or number…"
                  className="pl-9"
                />
              </div>
              <Select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as TransferStatus | "ALL")}
                className="w-auto"
              >
                <option value="ALL">All statuses</option>
                <option value="REQUESTED">Requested</option>
                <option value="EXECUTED">Completed</option>
                <option value="REJECTED">Rejected</option>
                <option value="CANCELLED">Cancelled</option>
              </Select>
            </div>

            {!filtered || filtered.length === 0 ? (
              <EmptyState
                title="No transfer records found."
                description={
                  transfers.length === 0
                    ? "Transfers appear here once a student moves to or from this school."
                    : "No transfers match your search or filters."
                }
                action={
                  canCreate &&
                  transfers.length === 0 && (
                    <Link href={`/schools/${schoolId}/students`}>
                      <Button size="sm">Transfer Student</Button>
                    </Link>
                  )
                }
              />
            ) : (
              <div className="space-y-3">
                {filtered.map((t) => {
                  const isIncomingPending = t.status === "REQUESTED" && t.toSchoolId === schoolId;
                  const isOutgoingPending = t.status === "REQUESTED" && t.fromSchoolId === schoolId;
                  const type = t.toSchoolId === schoolId ? "Incoming" : "Outgoing";
                  return (
                    <Card key={t.id} padding="sm">
                      <div className="flex flex-wrap items-center justify-between gap-3 p-2">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-medium text-foreground">
                              {t.student.firstName} {t.student.lastName}
                            </p>
                            <Badge tone="neutral">{type}</Badge>
                          </div>
                          <p className="text-sm text-foreground-soft">
                            {t.fromSchoolName} → {t.toSchoolName}
                          </p>
                          <p className="mt-0.5 text-xs text-foreground-muted">
                            {t.toEnrollment
                              ? `${t.toEnrollment.academicYear.name} · ${t.toEnrollment.class.name} - ${t.toEnrollment.section.name}`
                              : `From ${t.fromEnrollment.academicYear.name} · ${t.fromEnrollment.class.name} - ${t.fromEnrollment.section.name}`}
                            {t.reason && <> · &ldquo;{t.reason}&rdquo;</>}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge tone={STATUS_TONE[t.status]}>{t.status}</Badge>
                          <Link href={`/schools/${schoolId}/transfers/${t.id}`}>
                            <Button size="sm" variant="outline" icon={<ChevronRight className="size-4" />} aria-label="View" />
                          </Link>
                          {canApprove && isIncomingPending && approvingId !== t.id && (
                            <>
                              <Button size="sm" icon={<Check className="size-4" />} onClick={() => setApprovingId(t.id)}>
                                Approve
                              </Button>
                              <Button size="sm" variant="outline" icon={<X className="size-4" />} onClick={() => setRejectingId(t.id)}>
                                Reject
                              </Button>
                            </>
                          )}
                          {canCreate && isOutgoingPending && (
                            <Button
                              size="sm"
                              variant="outline"
                              icon={<XCircle className="size-4" />}
                              onClick={() => setCancellingId(t.id)}
                            >
                              Cancel
                            </Button>
                          )}
                        </div>
                      </div>
                      {approvingId === t.id && (
                        <div className="px-2 pb-2">
                          <ApproveTransferForm
                            schoolId={schoolId}
                            transfer={t}
                            onCancel={() => setApprovingId(null)}
                            onDone={(updated) => {
                              setTransfers((prev) => prev?.map((x) => (x.id === updated.id ? updated : x)) ?? prev);
                              setApprovingId(null);
                              show("Transfer approved.");
                            }}
                          />
                        </div>
                      )}
                    </Card>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>

      <ConfirmDialog
        open={!!rejectingId}
        title="Reject this transfer?"
        description="The student stays enrolled at their current school. This can't be undone."
        confirmLabel="Reject"
        loading={rejecting}
        onConfirm={onReject}
        onCancel={() => setRejectingId(null)}
      />

      <ConfirmDialog
        open={!!cancellingId}
        title="Cancel this transfer request?"
        description="The student stays enrolled at their current school. You can request a new transfer later."
        confirmLabel="Cancel request"
        loading={cancelling}
        onConfirm={onCancel}
        onCancel={() => setCancellingId(null)}
      />
    </div>
  );
}
