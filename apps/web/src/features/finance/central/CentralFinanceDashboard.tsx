"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Banknote, Clock, HandCoins, PiggyBank, Receipt, Smartphone, TrendingDown, Wallet } from "lucide-react";
import { useAuth, ApiError } from "@/lib/auth-context";
import { api, type CentralFinanceSummary } from "@/lib/api";
import { PageHeader, type Crumb } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { StatCard } from "@/components/ui/StatCard";
import { Alert } from "@/components/ui/Alert";
import { EmptyState } from "@/components/ui/EmptyState";
import { SkeletonCards } from "@/components/ui/Skeleton";

function money(n: number): string {
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function CentralFinanceDashboard({ pageTitle, breadcrumbs }: { pageTitle: string; breadcrumbs?: Crumb[] }) {
  const { accessToken } = useAuth();
  const [summary, setSummary] = useState<CentralFinanceSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken) return;
    api
      .getCentralFinanceSummary(accessToken)
      .then(setSummary)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load central finance summary"));
  }, [accessToken]);

  return (
    <div>
      <PageHeader eyebrow="Central Finance" title={pageTitle} description="Financial position across every school in the organization." breadcrumbs={breadcrumbs} />

      <div className="space-y-5 p-4 sm:p-6">
        {error ? (
          <Alert tone="danger">{error}</Alert>
        ) : !summary ? (
          <SkeletonCards count={4} />
        ) : (
          <>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard icon={Receipt} label="Total charged" value={money(summary.totals.totalCharged)} />
              <StatCard icon={HandCoins} label="Total collected" value={money(summary.totals.totalCollected)} tone="success" />
              <StatCard
                icon={Wallet}
                label="Outstanding"
                value={money(summary.totals.outstanding)}
                tone={summary.totals.outstanding > 0 ? "warning" : "success"}
              />
              <StatCard
                icon={Clock}
                label="Pending ZAAD verification"
                value={summary.totals.pendingZaadCount}
                hint={summary.totals.pendingZaadCount > 0 ? money(summary.totals.pendingZaadAmount) : undefined}
                tone={summary.totals.pendingZaadCount > 0 ? "warning" : "neutral"}
              />
              <StatCard icon={Banknote} label="Cash collected" value={money(summary.totals.cashCollection)} />
              <StatCard icon={Smartphone} label="ZAAD collected" value={money(summary.totals.zaadCollection)} />
              <StatCard icon={TrendingDown} label="Expenses" value={money(summary.totals.expensesTotal)} />
              <StatCard icon={PiggyBank} label="Payroll paid" value={money(summary.totals.payrollTotal)} />
              <div className="sm:col-span-2 lg:col-span-4">
                <StatCard
                  icon={Wallet}
                  label="Net financial position"
                  value={money(summary.totals.netFinancialPosition)}
                  tone={summary.totals.netFinancialPosition >= 0 ? "success" : "danger"}
                />
              </div>
            </div>

            <Card padding="none">
              <div className="border-b border-border px-5 py-3">
                <h2 className="text-sm font-semibold text-foreground">By school</h2>
              </div>
              {summary.schools.length === 0 ? (
                <div className="p-5">
                  <EmptyState icon={Wallet} title="No schools with financial activity yet" />
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[720px] text-left text-sm">
                    <thead className="bg-surface-soft text-xs font-semibold uppercase tracking-wide text-foreground-muted">
                      <tr>
                        <th className="px-5 py-2.5">School</th>
                        <th className="px-5 py-2.5">Charged</th>
                        <th className="px-5 py-2.5">Collected</th>
                        <th className="px-5 py-2.5">Outstanding</th>
                        <th className="px-5 py-2.5">Pending ZAAD</th>
                        <th className="px-5 py-2.5">Net position</th>
                        <th className="px-5 py-2.5" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {summary.schools.map((s) => (
                        <tr key={s.schoolId}>
                          <td className="px-5 py-3">
                            <p className="font-medium text-foreground">{s.schoolName}</p>
                            {s.academicYear && <p className="text-xs text-foreground-muted">{s.academicYear.name}</p>}
                          </td>
                          <td className="px-5 py-3 text-foreground-soft">{money(s.totalCharged)}</td>
                          <td className="px-5 py-3 text-foreground-soft">{money(s.totalCollected)}</td>
                          <td className={`px-5 py-3 ${s.outstanding > 0 ? "text-warning" : "text-foreground-soft"}`}>
                            {money(s.outstanding)}
                          </td>
                          <td className="px-5 py-3 text-foreground-soft">
                            {s.pendingZaadVerification.count > 0
                              ? `${s.pendingZaadVerification.count} · ${money(s.pendingZaadVerification.amount)}`
                              : "—"}
                          </td>
                          <td className={`px-5 py-3 font-medium ${s.netFinancialPosition >= 0 ? "text-success" : "text-danger"}`}>
                            {money(s.netFinancialPosition)}
                          </td>
                          <td className="px-5 py-3 text-right">
                            <Link
                              href={`/schools/${s.schoolId}/finance`}
                              className="inline-flex items-center gap-1 text-sm font-medium text-accent hover:underline"
                            >
                              View <ArrowRight className="size-3.5" />
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
