"use client";

import { useEffect, useState } from "react";
import { useAuth, ApiError } from "@/lib/auth-context";
import { api, type MyChildInvoice } from "@/lib/api";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Alert } from "@/components/ui/Alert";
import { EmptyState } from "@/components/ui/EmptyState";
import { SkeletonCards } from "@/components/ui/Skeleton";
import { Wallet } from "lucide-react";

const STATUS_TONE: Record<string, "success" | "warning" | "danger"> = {
  PAID: "success",
  PARTIALLY_PAID: "warning",
  UNPAID: "danger",
};

const TABS = ["Current Fees", "Outstanding Balance", "Payment History"] as const;
type Tab = (typeof TABS)[number];

export default function StudentFeesPage() {
  const { accessToken } = useAuth();
  const [tab, setTab] = useState<Tab>("Current Fees");
  const [invoices, setInvoices] = useState<MyChildInvoice[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken) return;
    api
      .getMyStudentInvoices(accessToken)
      .then(setInvoices)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load fees"));
  }, [accessToken]);

  return (
    <div>
      <PageHeader eyebrow="Student Portal" title="Fees" description="Fee summary, outstanding balance, and payment history." />

      <div className="border-b border-border px-4 sm:px-6">
        <div className="flex gap-1 overflow-x-auto">
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`shrink-0 border-b-2 px-3 py-3 text-sm font-medium transition-colors ${
                tab === t ? "border-accent text-accent" : "border-transparent text-foreground-soft hover:text-foreground"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-5 p-4 sm:p-6">
        {error ? (
          <Alert tone="danger">{error}</Alert>
        ) : !invoices ? (
          <SkeletonCards count={2} />
        ) : invoices.length === 0 ? (
          <Card>
            <EmptyState icon={Wallet} title="No fee records are available" />
          </Card>
        ) : (
          <FeesContent invoices={invoices} tab={tab} />
        )}
      </div>
    </div>
  );
}

function FeesContent({ invoices, tab }: { invoices: MyChildInvoice[]; tab: Tab }) {
  const totalAmount = invoices.reduce((sum, i) => sum + i.amount, 0);
  const totalPaid = invoices.reduce((sum, i) => sum + i.paid, 0);
  const totalBalance = invoices.reduce((sum, i) => sum + i.balance, 0);
  const outstanding = invoices.filter((i) => i.balance > 0);
  const payments = invoices
    .flatMap((i) => i.payments.map((p) => ({ ...p, feeName: i.feeName })))
    .sort((a, b) => new Date(b.paidAt).getTime() - new Date(a.paidAt).getTime());

  return (
    <>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Card padding="sm" className="text-center">
          <p className="text-2xl font-semibold text-foreground">{totalAmount.toFixed(2)}</p>
          <p className="mt-1 text-xs font-medium uppercase tracking-wide text-foreground-muted">Total fees</p>
        </Card>
        <Card padding="sm" className="text-center">
          <p className="text-2xl font-semibold text-success">{totalPaid.toFixed(2)}</p>
          <p className="mt-1 text-xs font-medium uppercase tracking-wide text-foreground-muted">Paid</p>
        </Card>
        <Card padding="sm" className="text-center">
          <p className={`text-2xl font-semibold ${totalBalance > 0 ? "text-danger" : "text-success"}`}>
            {totalBalance.toFixed(2)}
          </p>
          <p className="mt-1 text-xs font-medium uppercase tracking-wide text-foreground-muted">Outstanding</p>
        </Card>
      </div>

      {tab === "Current Fees" && (
        <Card padding="none">
          <InvoiceTable invoices={invoices} />
        </Card>
      )}

      {tab === "Outstanding Balance" && (
        <Card padding="none">
          {outstanding.length === 0 ? (
            <div className="p-5">
              <EmptyState icon={Wallet} title="Nothing outstanding" description="All invoices are fully paid." />
            </div>
          ) : (
            <InvoiceTable invoices={outstanding} />
          )}
        </Card>
      )}

      {tab === "Payment History" && (
        <Card padding="none">
          {payments.length === 0 ? (
            <div className="p-5">
              <EmptyState icon={Wallet} title="No payments recorded yet" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[480px] text-left text-sm">
                <thead className="bg-surface-soft text-xs font-semibold uppercase tracking-wide text-foreground-muted">
                  <tr>
                    <th className="px-5 py-2.5">Date</th>
                    <th className="px-5 py-2.5">Fee</th>
                    <th className="px-5 py-2.5">Amount</th>
                    <th className="px-5 py-2.5">Method</th>
                    <th className="px-5 py-2.5">Reference</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {payments.map((p) => (
                    <tr key={p.id}>
                      <td className="px-5 py-3 text-foreground">{new Date(p.paidAt).toLocaleDateString()}</td>
                      <td className="px-5 py-3 text-foreground-soft">{p.feeName}</td>
                      <td className="px-5 py-3 text-foreground-soft">{p.amount.toFixed(2)}</td>
                      <td className="px-5 py-3 text-foreground-soft">{p.method.replace("_", " ")}</td>
                      <td className="px-5 py-3 text-foreground-muted">{p.reference ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}
    </>
  );
}

function InvoiceTable({ invoices }: { invoices: MyChildInvoice[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[480px] text-left text-sm">
        <thead className="bg-surface-soft text-xs font-semibold uppercase tracking-wide text-foreground-muted">
          <tr>
            <th className="px-5 py-2.5">Fee</th>
            <th className="px-5 py-2.5">Amount</th>
            <th className="px-5 py-2.5">Paid</th>
            <th className="px-5 py-2.5">Balance</th>
            <th className="px-5 py-2.5">Status</th>
            <th className="px-5 py-2.5">Due date</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {invoices.map((i) => (
            <tr key={i.id}>
              <td className="px-5 py-3 text-foreground">{i.feeName}</td>
              <td className="px-5 py-3 text-foreground-soft">{i.amount.toFixed(2)}</td>
              <td className="px-5 py-3 text-foreground-soft">{i.paid.toFixed(2)}</td>
              <td className="px-5 py-3 text-foreground-soft">{i.balance.toFixed(2)}</td>
              <td className="px-5 py-3">
                <Badge tone={STATUS_TONE[i.status]}>{i.status.replace("_", " ")}</Badge>
              </td>
              <td className="px-5 py-3 text-foreground-muted">{i.dueDate ? new Date(i.dueDate).toLocaleDateString() : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
