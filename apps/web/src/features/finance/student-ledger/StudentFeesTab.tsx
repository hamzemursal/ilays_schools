"use client";

import { useEffect, useState } from "react";
import { HandCoins, Receipt, Wallet } from "lucide-react";
import type { StudentLedger, StudentLedgerEntry } from "@/lib/api";
import { api } from "@/lib/api";
import { ApiError } from "@/lib/auth-context";
import { RecordEntryPaymentForm } from "../RecordEntryPaymentForm";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { EmptyState } from "@/components/ui/EmptyState";
import { StatCard } from "@/components/ui/StatCard";
import { SkeletonCards } from "@/components/ui/Skeleton";

const STATUS_TONE: Record<string, "danger" | "warning" | "success" | "neutral"> = {
  UNPAID: "danger",
  OUTSTANDING: "danger",
  PARTIALLY_PAID: "warning",
  PAID: "success",
  CANCELLED: "neutral",
};

function money(n: number): string {
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function StudentFeesTab({
  accessToken,
  studentId,
  canRecordPayments,
}: {
  accessToken: string;
  studentId: string;
  canRecordPayments: boolean;
}) {
  const [ledger, setLedger] = useState<StudentLedger | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openEntryId, setOpenEntryId] = useState<string | null>(null);

  function load() {
    api
      .getStudentLedger(accessToken, studentId)
      .then(setLedger)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load fees"));
  }

  useEffect(load, [accessToken, studentId]);

  if (error) return <Alert tone="danger">{error}</Alert>;
  if (!ledger) return <SkeletonCards count={3} />;

  const entries: StudentLedgerEntry[] = [...ledger.invoices, ...ledger.charges];
  const allPayments = entries.flatMap((e) => e.payments.map((p) => ({ ...p, entryLabel: e.feeStructure.name })));

  function patchEntry(id: string, patch: Partial<StudentLedgerEntry>) {
    setLedger((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        invoices: prev.invoices.map((i) => (i.id === id ? { ...i, ...patch } : i)),
        charges: prev.charges.map((c) => (c.id === id ? { ...c, ...patch } : c)),
      };
    });
    setOpenEntryId(null);
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard icon={Receipt} label="Total fees" value={money(ledger.summary.totalCharged)} />
        <StatCard icon={HandCoins} label="Paid" value={money(ledger.summary.totalPaid)} tone="success" />
        <StatCard
          icon={Wallet}
          label="Outstanding"
          value={money(ledger.summary.balance)}
          tone={ledger.summary.balance > 0 ? "warning" : "success"}
        />
      </div>

      <Card padding="none">
        <div className="border-b border-border px-5 py-3">
          <h2 className="text-sm font-semibold text-foreground">Fee schedule</h2>
        </div>
        {entries.length === 0 ? (
          <div className="p-5">
            <EmptyState title="No fees charged yet" />
          </div>
        ) : (
          <div className="divide-y divide-border">
            {entries.map((e) => (
              <div key={e.id} className="p-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="font-medium text-foreground">{e.feeStructure.name}</p>
                    <p className="text-sm text-foreground-soft">
                      {e.kind === "CHARGE" && e.billingPeriod ? `${e.billingPeriod.name} · ` : ""}
                      {money(e.amount)} · paid {money(e.paid)} · balance {money(e.amount - e.paid)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge tone={STATUS_TONE[e.status] ?? "neutral"}>{e.status.replace("_", " ")}</Badge>
                    {canRecordPayments && e.status !== "PAID" && e.status !== "CANCELLED" && (
                      <Button size="sm" variant="outline" onClick={() => setOpenEntryId(openEntryId === e.id ? null : e.id)}>
                        {openEntryId === e.id ? "Cancel" : "Record payment"}
                      </Button>
                    )}
                  </div>
                </div>
                {openEntryId === e.id && (
                  <RecordEntryPaymentForm accessToken={accessToken} entry={e} onRecorded={(patch) => patchEntry(e.id, patch)} />
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      {ledger.adjustments.length > 0 && (
        <Card padding="none">
          <div className="border-b border-border px-5 py-3">
            <h2 className="text-sm font-semibold text-foreground">Discounts &amp; adjustments</h2>
          </div>
          <div className="divide-y divide-border">
            {ledger.adjustments.map((a) => (
              <div key={a.id} className="flex items-center justify-between p-4">
                <div>
                  <p className="font-medium text-foreground">
                    {a.type.charAt(0) + a.type.slice(1).toLowerCase()} · {money(Number(a.amount))}
                  </p>
                  <p className="text-sm text-foreground-soft">{a.reason}</p>
                </div>
                <Badge tone={a.status === "APPROVED" ? "success" : a.status === "REJECTED" ? "danger" : "warning"}>{a.status}</Badge>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card padding="none">
        <div className="border-b border-border px-5 py-3">
          <h2 className="text-sm font-semibold text-foreground">Payment history</h2>
        </div>
        {allPayments.length === 0 ? (
          <div className="p-5">
            <EmptyState title="No payments recorded yet" />
          </div>
        ) : (
          <div className="divide-y divide-border">
            {allPayments
              .sort((a, b) => new Date(b.paidAt).getTime() - new Date(a.paidAt).getTime())
              .map((p) => (
                <div key={p.id} className="flex items-center justify-between p-4">
                  <div>
                    <p className="font-medium text-foreground">
                      {money(Number(p.amount))} · {p.method.replace("_", " ")}
                    </p>
                    <p className="text-sm text-foreground-soft">
                      {p.entryLabel} · {new Date(p.paidAt).toLocaleDateString()}
                      {p.reference ? ` · Ref: ${p.reference}` : ""}
                    </p>
                  </div>
                  <Badge tone={p.status === "POSTED" ? "success" : "danger"}>{p.status}</Badge>
                </div>
              ))}
          </div>
        )}
      </Card>
    </div>
  );
}
