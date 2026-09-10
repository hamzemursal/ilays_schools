"use client";

import { useEffect, useState } from "react";
import { Banknote, Clock, HandCoins, PiggyBank, Receipt, Smartphone, TrendingDown, Wallet } from "lucide-react";
import { ApiError } from "@/lib/auth-context";
import { api, type FinanceDashboardSummary } from "@/lib/api";
import { StatCard } from "@/components/ui/StatCard";
import { Alert } from "@/components/ui/Alert";
import { SkeletonCards } from "@/components/ui/Skeleton";

function money(n: number): string {
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function FinanceDashboardTab({ accessToken, schoolId }: { accessToken: string; schoolId: string }) {
  const [summary, setSummary] = useState<FinanceDashboardSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .getFinanceDashboardSummary(accessToken, schoolId)
      .then(setSummary)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load finance dashboard"));
  }, [accessToken, schoolId]);

  if (error) return <Alert tone="danger">{error}</Alert>;
  if (!summary) return <SkeletonCards count={4} />;

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <StatCard icon={Receipt} label="Total charged" value={money(summary.totalCharged)} />
      <StatCard icon={HandCoins} label="Total collected" value={money(summary.totalCollected)} tone="success" />
      <StatCard
        icon={Wallet}
        label="Outstanding"
        value={money(summary.outstanding)}
        tone={summary.outstanding > 0 ? "warning" : "success"}
      />
      <StatCard
        icon={Clock}
        label="Pending ZAAD verification"
        value={summary.pendingZaadVerification.count}
        hint={summary.pendingZaadVerification.count > 0 ? money(summary.pendingZaadVerification.amount) : undefined}
        tone={summary.pendingZaadVerification.count > 0 ? "warning" : "neutral"}
      />
      <StatCard icon={Banknote} label="Cash collected" value={money(summary.cashCollection)} />
      <StatCard icon={Smartphone} label="ZAAD collected" value={money(summary.zaadCollection)} />
      <StatCard icon={TrendingDown} label="Expenses" value={money(summary.expensesTotal)} />
      <StatCard icon={PiggyBank} label="Payroll paid" value={money(summary.payrollTotal)} />
      <div className="sm:col-span-2 lg:col-span-4">
        <StatCard
          icon={Wallet}
          label="Net financial position"
          value={money(summary.netFinancialPosition)}
          tone={summary.netFinancialPosition >= 0 ? "success" : "danger"}
        />
      </div>
    </div>
  );
}
