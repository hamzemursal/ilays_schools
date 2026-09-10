"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useAuth, ApiError } from "@/lib/auth-context";
import { api, type MyChildInvoice, type PaymentSubmission, type PaymentSubmissionStatus } from "@/lib/api";
import { useSelectedChild } from "@/features/parent-portal/SelectedChildContext";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { EmptyState } from "@/components/ui/EmptyState";
import { FormField, Input, Textarea } from "@/components/ui/FormControls";
import { SkeletonCards } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import { Wallet, Users, Send } from "lucide-react";

const STATUS_TONE: Record<string, "success" | "warning" | "danger"> = {
  PAID: "success",
  PARTIALLY_PAID: "warning",
  UNPAID: "danger",
};

const SUBMISSION_STATUS_TONE: Record<PaymentSubmissionStatus, "success" | "warning" | "danger"> = {
  VERIFIED: "success",
  PENDING: "warning",
  REJECTED: "danger",
};

const TABS = ["Current Fees", "Outstanding Balance", "Payment History", "Submit Payment"] as const;
type Tab = (typeof TABS)[number];

export default function ParentFeesPage() {
  const { accessToken } = useAuth();
  const { selectedChild, loading: childrenLoading, children } = useSelectedChild();
  const [tab, setTab] = useState<Tab>("Current Fees");

  return (
    <div>
      <PageHeader eyebrow="Parent Portal" title="Fees" description="Fee summary, outstanding balance, and payment history." />

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
        {childrenLoading ? (
          <SkeletonCards count={2} />
        ) : children.length === 0 ? (
          <EmptyState icon={Users} title="No children linked yet" />
        ) : !selectedChild || !accessToken ? (
          <EmptyState icon={Users} title="Select a child above" />
        ) : (
          <FeesContent key={selectedChild.studentId} accessToken={accessToken} studentId={selectedChild.studentId} tab={tab} />
        )}
      </div>
    </div>
  );
}

function FeesContent({ accessToken, studentId, tab }: { accessToken: string; studentId: string; tab: Tab }) {
  const [invoices, setInvoices] = useState<MyChildInvoice[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .getMyChildInvoices(accessToken, studentId)
      .then(setInvoices)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load fees"));
  }, [accessToken, studentId]);

  if (error) return <Alert tone="danger">{error}</Alert>;
  if (!invoices) return <SkeletonCards count={2} />;

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
          {invoices.length === 0 ? (
            <div className="p-5">
              <EmptyState icon={Wallet} title="No invoices yet" />
            </div>
          ) : (
            <InvoiceTable invoices={invoices} />
          )}
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

      {tab === "Submit Payment" && <ZaadSubmissionSection accessToken={accessToken} studentId={studentId} />}
    </>
  );
}

function ZaadSubmissionSection({ accessToken, studentId }: { accessToken: string; studentId: string }) {
  const [submissions, setSubmissions] = useState<PaymentSubmission[] | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [reference, setReference] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const { show } = useToast();

  function load() {
    api
      .listMyPaymentSubmissions(accessToken)
      .then((all) => {
        setSubmissions(all.filter((s) => s.studentId === studentId));
        setHistoryError(null);
      })
      .catch((err) => setHistoryError(err instanceof ApiError ? err.message : "Failed to load submissions"));
  }

  useEffect(load, [accessToken, studentId]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    setSubmitting(true);
    try {
      await api.submitMyPaymentNotice(accessToken, studentId, {
        amount: Number(amount),
        providerTransactionReference: reference || undefined,
      });
      setAmount("");
      setReference("");
      show("Payment notice submitted. It will be verified by the school.");
      load();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Failed to submit payment notice");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader title="Report a ZAAD payment" description="Sent an amount via ZAAD? Let the school know so they can verify it." />
        <form onSubmit={onSubmit} className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <FormField label="Amount">
            <Input required type="number" min={0.01} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </FormField>
          <FormField label="Reference (optional)">
            <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Transaction ID" />
          </FormField>
          <div className="flex items-end">
            <Button type="submit" loading={submitting} className="w-full" icon={<Send className="size-4" />}>
              Submit
            </Button>
          </div>
          {formError && (
            <Alert tone="danger" className="sm:col-span-3">
              {formError}
            </Alert>
          )}
        </form>
      </Card>

      <Card padding="none">
        <div className="border-b border-border px-5 py-3">
          <h2 className="text-sm font-semibold text-foreground">Submission history</h2>
        </div>
        {historyError ? (
          <div className="p-5">
            <Alert tone="danger">{historyError}</Alert>
          </div>
        ) : !submissions ? (
          <div className="p-5">
            <SkeletonCards count={1} />
          </div>
        ) : submissions.length === 0 ? (
          <div className="p-5">
            <EmptyState icon={Wallet} title="No payment notices submitted yet" />
          </div>
        ) : (
          <div className="divide-y divide-border">
            {submissions
              .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
              .map((s) => (
                <div key={s.id} className="flex items-center justify-between p-4">
                  <div>
                    <p className="font-medium text-foreground">{Number(s.amount).toFixed(2)}</p>
                    <p className="text-sm text-foreground-soft">
                      {new Date(s.createdAt).toLocaleDateString()}
                      {s.providerTransactionReference ? ` · Ref: ${s.providerTransactionReference}` : ""}
                    </p>
                    {s.status === "REJECTED" && s.rejectionReason && (
                      <p className="mt-1 text-sm text-danger">Reason: {s.rejectionReason}</p>
                    )}
                  </div>
                  <Badge tone={SUBMISSION_STATUS_TONE[s.status]}>{s.status}</Badge>
                </div>
              ))}
          </div>
        )}
      </Card>
    </div>
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
