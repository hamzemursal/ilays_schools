"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowRight, Check, ChevronRight, Search, X, XCircle } from "lucide-react";
import { useAuth, ApiError } from "@/lib/auth-context";
import {
  api,
  type AcademicYear,
  type School,
  type TransferDirection,
  type TransferListResponse,
  type TransferStatus,
} from "@/lib/api";
import { PageHeader, type Crumb } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/FormControls";
import { EmptyState } from "@/components/ui/EmptyState";
import { SkeletonTable } from "@/components/ui/Skeleton";
import { pageNumbersFor } from "@/components/ui/DataTable";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useToast } from "@/components/ui/Toast";
import { TransferStatusBadge } from "./TransferBadges";
import { TransferSummaryCards } from "./TransferSummaryCards";
import { ApproveTransferForm } from "./components/ApproveTransferForm";
import { RejectTransferDialog } from "./components/RejectTransferDialog";

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

const EMPTY_COPY: Record<"incoming" | "outgoing" | "all", { title: string; description: string }> = {
  incoming: { title: "No incoming transfers", description: "No transfer requests are currently waiting for your school." },
  outgoing: { title: "No outgoing transfers", description: "This school has no outgoing transfer requests." },
  all: { title: "No transfers found", description: "Try widening your filters." },
};

export function TransferListExplorer({
  direction,
  fixedSchoolId,
  pageTitle,
  breadcrumbs,
}: {
  direction?: TransferDirection;
  fixedSchoolId?: string;
  pageTitle: string;
  breadcrumbs?: Crumb[];
}) {
  const { user, accessToken } = useAuth();
  const searchParams = useSearchParams();
  const { show } = useToast();
  const isOrgWide = !fixedSchoolId;

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [schools, setSchools] = useState<School[]>([]);
  const [originSchoolId, setOriginSchoolId] = useState("");
  const [destinationSchoolId, setDestinationSchoolId] = useState("");
  const [academicYears, setAcademicYears] = useState<AcademicYear[]>([]);
  const [academicYearId, setAcademicYearId] = useState("");
  const [status, setStatus] = useState<TransferStatus | "">(
    (searchParams.get("status") as TransferStatus | null) ?? "",
  );
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [result, setResult] = useState<TransferListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<{ pending: number; rejected: number; completed: number; cancelled: number } | null>(null);

  const [acceptingId, setAcceptingId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);

  const canApprove = user?.permissions.includes("transfers.approve") ?? false;
  const canCreate = user?.permissions.includes("transfers.create") ?? false;

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 350);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    if (!accessToken || !isOrgWide) return;
    api
      .listSchools(accessToken)
      .then(setSchools)
      .catch(() => undefined);
  }, [accessToken, isOrgWide]);

  useEffect(() => {
    if (!accessToken || !fixedSchoolId) return;
    api
      .listAcademicYears(accessToken, fixedSchoolId)
      .then(setAcademicYears)
      .catch(() => setAcademicYears([]));
  }, [accessToken, fixedSchoolId]);

  const filterKey = JSON.stringify({
    fixedSchoolId,
    direction,
    originSchoolId,
    destinationSchoolId,
    academicYearId,
    status,
    search: debouncedSearch,
    pageSize,
  });
  const fetchKey = `${filterKey}:${page}`;
  const [prevFilterKey, setPrevFilterKey] = useState(filterKey);
  const [prevFetchKey, setPrevFetchKey] = useState(fetchKey);
  if (filterKey !== prevFilterKey) {
    setPrevFilterKey(filterKey);
    setPage(1);
  }
  if (fetchKey !== prevFetchKey) {
    setPrevFetchKey(fetchKey);
    setLoading(true);
    setError(null);
  }

  useEffect(() => {
    if (!accessToken) return;
    api
      .listTransfers(accessToken, {
        schoolId: fixedSchoolId,
        direction,
        originSchoolId: originSchoolId || undefined,
        destinationSchoolId: destinationSchoolId || undefined,
        academicYearId: academicYearId || undefined,
        status: status || undefined,
        search: debouncedSearch || undefined,
        page,
        pageSize,
      })
      .then(setResult)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load transfers"))
      .finally(() => setLoading(false));
    // filterKey already captures every filter field plus pageSize.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken, filterKey, page]);

  useEffect(() => {
    if (!accessToken || !direction) return;
    api
      .getTransferSummary(accessToken, fixedSchoolId)
      .then((s) => setSummary(s[direction]))
      .catch(() => setSummary(null));
  }, [accessToken, fixedSchoolId, direction, result]);

  async function onReject(reason: string) {
    if (!accessToken || !rejectingId) return;
    setRejecting(true);
    try {
      await api.rejectTransfer(accessToken, rejectingId, { reason });
      setResult((prev) =>
        prev
          ? { ...prev, data: prev.data.map((t) => (t.id === rejectingId ? { ...t, status: "REJECTED", rejectionReason: reason } : t)) }
          : prev,
      );
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
      setResult((prev) => (prev ? { ...prev, data: prev.data.map((t) => (t.id === updated.id ? updated : t)) } : prev));
      show("Transfer request cancelled.");
    } catch (err) {
      show(err instanceof ApiError ? err.message : "Failed to cancel transfer", "danger");
    } finally {
      setCancelling(false);
      setCancellingId(null);
    }
  }

  const rejectingTransfer = result?.data.find((t) => t.id === rejectingId);
  const emptyCopy = EMPTY_COPY[direction ?? "all"];

  return (
    <div>
      <PageHeader eyebrow="Transfers" title={pageTitle} breadcrumbs={breadcrumbs} />

      <div className="space-y-5 p-4 sm:p-6">
        {direction && (
          <div>
            <TransferSummaryCards summary={summary} loading={!summary} />
          </div>
        )}

        <div className="flex flex-wrap items-end gap-2.5">
          <div className="relative w-full max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-foreground-muted" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by student name or ID…"
              className="!bg-surface pl-9 pr-9"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                aria-label="Clear search"
                className="absolute right-2.5 top-1/2 flex size-5 -translate-y-1/2 items-center justify-center rounded-full text-foreground-muted hover:bg-surface-hover hover:text-foreground"
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>

          {isOrgWide && (
            <>
              <div>
                <label className="mb-1 block text-xs font-medium text-foreground-soft">Origin School</label>
                <Select value={originSchoolId} onChange={(e) => setOriginSchoolId(e.target.value)} className="w-44">
                  <option value="">All schools</option>
                  {schools.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-foreground-soft">Destination School</label>
                <Select value={destinationSchoolId} onChange={(e) => setDestinationSchoolId(e.target.value)} className="w-44">
                  <option value="">All schools</option>
                  {schools.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </Select>
              </div>
            </>
          )}

          {fixedSchoolId && (
            <div>
              <label className="mb-1 block text-xs font-medium text-foreground-soft">Academic Year</label>
              <Select value={academicYearId} onChange={(e) => setAcademicYearId(e.target.value)} className="w-40">
                <option value="">All academic years</option>
                {academicYears.map((y) => (
                  <option key={y.id} value={y.id}>
                    {y.name}
                    {y.isCurrent ? " (current)" : ""}
                  </option>
                ))}
              </Select>
            </div>
          )}

          <div>
            <label className="mb-1 block text-xs font-medium text-foreground-soft">Status</label>
            <Select value={status} onChange={(e) => setStatus(e.target.value as TransferStatus | "")} className="w-40">
              <option value="">All statuses</option>
              <option value="REQUESTED">Pending</option>
              <option value="EXECUTED">Completed</option>
              <option value="REJECTED">Rejected</option>
              <option value="CANCELLED">Cancelled</option>
            </Select>
          </div>
        </div>

        {error ? (
          <Alert tone="danger">{error}</Alert>
        ) : loading ? (
          <SkeletonTable rows={8} cols={7} />
        ) : !result || result.data.length === 0 ? (
          <EmptyState title={emptyCopy.title} description={emptyCopy.description} />
        ) : (
          <div className="space-y-3">
            {result.data.map((t) => {
              const isIncomingPending =
                t.status === "REQUESTED" && (fixedSchoolId ? t.toSchoolId === fixedSchoolId : direction === "incoming");
              const isOutgoingPending =
                t.status === "REQUESTED" && (fixedSchoolId ? t.fromSchoolId === fixedSchoolId : direction === "outgoing");
              return (
                <Card key={t.id} padding="sm">
                  <div className="flex flex-wrap items-center justify-between gap-3 p-2">
                    <div className="min-w-0">
                      <p className="font-medium text-foreground">
                        {t.student.firstName} {t.student.lastName}
                      </p>
                      <p className="flex items-center gap-1.5 text-sm text-foreground-soft">
                        {t.fromSchoolName} <ArrowRight className="size-3.5 shrink-0" /> {t.toSchoolName}
                      </p>
                      <p className="mt-0.5 text-xs text-foreground-muted">
                        {t.toEnrollment
                          ? `${t.toEnrollment.academicYear.name} · ${t.toEnrollment.class.name} - ${t.toEnrollment.section.name}`
                          : `From ${t.fromEnrollment.academicYear.name} · ${t.fromEnrollment.class.name} - ${t.fromEnrollment.section.name}`}
                        {t.reason && <> · &ldquo;{t.reason}&rdquo;</>}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <TransferStatusBadge status={t.status} />
                      <Link href={`/schools/${fixedSchoolId ?? t.toSchoolId}/transfers/${t.id}`}>
                        <Button size="sm" variant="outline" icon={<ChevronRight className="size-4" />} aria-label="View" />
                      </Link>
                      {canApprove && isIncomingPending && acceptingId !== t.id && (
                        <>
                          <Button size="sm" icon={<Check className="size-4" />} onClick={() => setAcceptingId(t.id)}>
                            Accept
                          </Button>
                          <Button size="sm" variant="outline" icon={<X className="size-4" />} onClick={() => setRejectingId(t.id)}>
                            Reject
                          </Button>
                        </>
                      )}
                      {canCreate && isOutgoingPending && (
                        <Button size="sm" variant="outline" icon={<XCircle className="size-4" />} onClick={() => setCancellingId(t.id)}>
                          Cancel
                        </Button>
                      )}
                    </div>
                  </div>
                  {acceptingId === t.id && (
                    <div className="px-2 pb-2">
                      <ApproveTransferForm
                        schoolId={t.toSchoolId}
                        transfer={t}
                        onCancel={() => setAcceptingId(null)}
                        onDone={(updated) => {
                          setResult((prev) => (prev ? { ...prev, data: prev.data.map((x) => (x.id === updated.id ? updated : x)) } : prev));
                          setAcceptingId(null);
                          show("Transfer accepted — student enrolled.");
                        }}
                      />
                    </div>
                  )}
                </Card>
              );
            })}

            <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
              <p className="text-sm text-foreground-soft">
                Showing {(result.pagination.page - 1) * result.pagination.pageSize + 1} to{" "}
                {Math.min(result.pagination.page * result.pagination.pageSize, result.pagination.total)} of{" "}
                {result.pagination.total.toLocaleString()} transfers
              </p>
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-1">
                  <Button size="sm" variant="outline" disabled={result.pagination.page === 1} onClick={() => setPage((p) => p - 1)}>
                    Previous
                  </Button>
                  {pageNumbersFor(result.pagination.page, result.pagination.totalPages).map((n, i) =>
                    n === "…" ? (
                      <span key={`ellipsis-${i}`} className="px-1.5 text-sm text-foreground-muted">
                        …
                      </span>
                    ) : (
                      <button
                        key={n}
                        onClick={() => setPage(n)}
                        aria-current={n === result.pagination.page ? "page" : undefined}
                        className={`flex size-8 items-center justify-center rounded-lg text-sm font-medium transition-colors ${
                          n === result.pagination.page ? "bg-accent text-white" : "text-foreground-soft hover:bg-surface-hover hover:text-foreground"
                        }`}
                      >
                        {n}
                      </button>
                    ),
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={result.pagination.page === result.pagination.totalPages}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Next
                  </Button>
                </div>
                <label className="flex items-center gap-1.5 text-sm text-foreground-soft">
                  Rows per page:
                  <select
                    value={pageSize}
                    onChange={(e) => setPageSize(Number(e.target.value))}
                    className="rounded-lg border border-border bg-background px-2 py-1 text-sm text-foreground outline-none focus:border-accent focus:ring-2 focus:ring-accent/15"
                  >
                    {PAGE_SIZE_OPTIONS.map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </div>
          </div>
        )}
      </div>

      <RejectTransferDialog
        open={!!rejectingId}
        studentName={rejectingTransfer ? `${rejectingTransfer.student.firstName} ${rejectingTransfer.student.lastName}` : "This student"}
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
