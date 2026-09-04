"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeftRight, ArrowRight, LogIn, LogOut, Users } from "lucide-react";
import { useAuth, ApiError } from "@/lib/auth-context";
import { api, type TransferSummary } from "@/lib/api";
import { PageHeader, type Crumb } from "@/components/ui/PageHeader";
import { Alert } from "@/components/ui/Alert";
import { SkeletonCards } from "@/components/ui/Skeleton";
import { TransferSummaryCards } from "./TransferSummaryCards";

export function TransfersOverview({
  fixedSchoolId,
  pageTitle,
  breadcrumbs,
}: {
  fixedSchoolId?: string;
  pageTitle: string;
  breadcrumbs?: Crumb[];
}) {
  const { accessToken } = useAuth();
  const [summary, setSummary] = useState<TransferSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken) return;
    api
      .getTransferSummary(accessToken, fixedSchoolId)
      .then(setSummary)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load transfer summary"))
      .finally(() => setLoading(false));
  }, [accessToken, fixedSchoolId]);

  const basePath = fixedSchoolId ? `/schools/${fixedSchoolId}/transfers` : "/transfers";
  const totalPending = (summary?.incoming.pending ?? 0) + (summary?.outgoing.pending ?? 0);

  return (
    <div>
      <PageHeader
        eyebrow="Transfers"
        title={pageTitle}
        description="Students moving between schools in the organization."
        breadcrumbs={breadcrumbs}
      />

      <div className="space-y-6 p-4 sm:p-6">
        {error && <Alert tone="danger">{error}</Alert>}

        {totalPending > 0 && (
          <Alert tone="warning">
            {totalPending} transfer{totalPending === 1 ? "" : "s"} waiting on a decision —{" "}
            {summary!.incoming.pending > 0 && (
              <Link href={`${basePath}/incoming`} className="font-medium underline">
                {summary!.incoming.pending} incoming
              </Link>
            )}
            {summary!.incoming.pending > 0 && summary!.outgoing.pending > 0 && ", "}
            {summary!.outgoing.pending > 0 && (
              <Link href={`${basePath}/outgoing`} className="font-medium underline">
                {summary!.outgoing.pending} outgoing
              </Link>
            )}
          </Alert>
        )}

        <div>
          <h2 className="mb-2 flex items-center gap-1.5 text-sm font-semibold uppercase tracking-wide text-foreground-muted">
            <LogIn className="size-4" /> Incoming
          </h2>
          {loading ? <SkeletonCards count={4} /> : <TransferSummaryCards summary={summary?.incoming ?? null} loading={loading} />}
        </div>

        <div>
          <h2 className="mb-2 flex items-center gap-1.5 text-sm font-semibold uppercase tracking-wide text-foreground-muted">
            <LogOut className="size-4" /> Outgoing
          </h2>
          {loading ? <SkeletonCards count={4} /> : <TransferSummaryCards summary={summary?.outgoing ?? null} loading={loading} />}
        </div>

        <div>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-foreground-muted">Pages</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <QuickLink icon={LogIn} label="Incoming Transfers" href={`${basePath}/incoming`} />
            <QuickLink icon={LogOut} label="Outgoing Transfers" href={`${basePath}/outgoing`} />
            <QuickLink icon={Users} label="All Students" href={fixedSchoolId ? `/schools/${fixedSchoolId}/students` : "/schools"} />
          </div>
        </div>
      </div>
    </div>
  );
}

function QuickLink({ icon: Icon, label, href }: { icon: typeof ArrowLeftRight; label: string; href: string }) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 rounded-xl border border-border bg-background p-4 shadow-sm transition-colors hover:border-accent"
    >
      <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">
        <Icon className="size-4.5" />
      </div>
      <span className="flex-1 text-sm font-medium text-foreground">{label}</span>
      <ArrowRight className="size-4 shrink-0 text-foreground-muted" />
    </Link>
  );
}
