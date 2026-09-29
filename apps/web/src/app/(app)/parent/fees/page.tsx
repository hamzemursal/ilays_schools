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
import { CheckCircle2, CircleDollarSign, Send, TriangleAlert, Users, Wallet } from "lucide-react";
import { PillTabs, StatTile } from "@/features/parent-portal/ParentUI";
import { SO_INVOICE_STATUS, SO_PAYMENT_METHOD, SO_SUBMISSION_STATUS, soDate, soStatus } from "@/features/parent-portal/so";

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

const TABS = ["Lacagaha hadda", "Haraaga lagu leeyahay", "Taariikhda lacag-bixinta", "Soo sheeg lacag-bixin"] as const;
type Tab = (typeof TABS)[number];

export default function ParentFeesPage() {
  const { accessToken } = useAuth();
  const { selectedChild, loading: childrenLoading, children } = useSelectedChild();
  const [tab, setTab] = useState<Tab>("Lacagaha hadda");

  return (
    <div>
      <PageHeader
        variant="plain"
        eyebrow="Portal-ka Waalidka"
        title="Lacagaha"
        description={
          selectedChild
            ? `Lacagaha ${selectedChild.firstName}: wadarta, haraaga iyo taariikhda lacag-bixinta.`
            : "Wadarta lacagaha, haraaga iyo taariikhda lacag-bixinta."
        }
      />

      <div className="space-y-5 px-3 pb-8 pt-4 sm:px-5">
        <PillTabs tabs={TABS} active={tab} onChange={setTab} />
        {childrenLoading ? (
          <SkeletonCards count={2} />
        ) : children.length === 0 ? (
          <EmptyState icon={Users} title="Weli ilmo laguma xirin akoonkaaga" />
        ) : !selectedChild || !accessToken ? (
          <EmptyState icon={Users} title="Kor ka dooro ilmo" />
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
      .catch((err) => setError(err instanceof ApiError ? err.message : "Lama soo rarin lacagaha"));
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
        <StatTile icon={CircleDollarSign} tone="bg-accent-soft text-accent" label="Wadarta lacagaha" value={`$${totalAmount.toFixed(2)}`} />
        <StatTile icon={CheckCircle2} tone="bg-success-soft text-success" label="La bixiyay" value={`$${totalPaid.toFixed(2)}`} />
        <StatTile
          icon={TriangleAlert}
          tone={totalBalance > 0 ? "bg-danger-soft text-danger" : "bg-success-soft text-success"}
          label="Haraaga lagu leeyahay"
          value={`$${totalBalance.toFixed(2)}`}
        />
      </div>

      {tab === "Lacagaha hadda" && (
        <Card padding="none" className="rounded-2xl">
          {invoices.length === 0 ? (
            <div className="p-5">
              <EmptyState icon={Wallet} title="Weli biil lama soo saarin" />
            </div>
          ) : (
            <InvoiceTable invoices={invoices} />
          )}
        </Card>
      )}

      {tab === "Haraaga lagu leeyahay" && (
        <Card padding="none" className="rounded-2xl">
          {outstanding.length === 0 ? (
            <div className="p-5">
              <EmptyState icon={Wallet} title="Wax lagugu leeyahay ma jiro" description="Dhammaan biilasha si buuxda ayaa loo bixiyay." />
            </div>
          ) : (
            <InvoiceTable invoices={outstanding} />
          )}
        </Card>
      )}

      {tab === "Taariikhda lacag-bixinta" && (
        <Card padding="none" className="rounded-2xl">
          {payments.length === 0 ? (
            <div className="p-5">
              <EmptyState icon={Wallet} title="Weli lacag-bixin lama diiwaangelin" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[480px] text-left text-sm">
                <thead className="bg-surface-soft text-xs font-semibold uppercase tracking-wide text-foreground-muted">
                  <tr>
                    <th className="px-5 py-2.5">Taariikhda</th>
                    <th className="px-5 py-2.5">Lacagta</th>
                    <th className="px-5 py-2.5">Qadarka</th>
                    <th className="px-5 py-2.5">Habka</th>
                    <th className="px-5 py-2.5">Tixraaca</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {payments.map((p) => (
                    <tr key={p.id}>
                      <td className="px-5 py-3 text-foreground">{soDate(p.paidAt)}</td>
                      <td className="px-5 py-3 text-foreground-soft">{p.feeName}</td>
                      <td className="px-5 py-3 text-foreground-soft">{p.amount.toFixed(2)}</td>
                      <td className="px-5 py-3 text-foreground-soft">{soStatus(SO_PAYMENT_METHOD, p.method)}</td>
                      <td className="px-5 py-3 text-foreground-muted">{p.reference ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {tab === "Soo sheeg lacag-bixin" && <ZaadSubmissionSection accessToken={accessToken} studentId={studentId} />}
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
      .catch((err) => setHistoryError(err instanceof ApiError ? err.message : "Lama soo rarin warbixinnada"));
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
      show("Warbixinta lacag-bixinta waa la diray. Dugsiga ayaa xaqiijin doona.");
      load();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Lama dirin warbixinta lacag-bixinta");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-5">
      <Card className="rounded-2xl">
        <CardHeader title="Soo sheeg lacag ZAAD ah" description="Ma ku dirtay lacag ZAAD? U sheeg dugsiga si ay u xaqiijiyaan." />
        <form onSubmit={onSubmit} className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <FormField label="Qadarka">
            <Input required type="number" min={0.01} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </FormField>
          <FormField label="Tixraaca (ikhtiyaari)">
            <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Lambarka macaamilka" />
          </FormField>
          <div className="flex items-end">
            <Button type="submit" loading={submitting} className="w-full" icon={<Send className="size-4" />}>
              Dir
            </Button>
          </div>
          {formError && (
            <Alert tone="danger" className="sm:col-span-3">
              {formError}
            </Alert>
          )}
        </form>
      </Card>

      <Card padding="none" className="rounded-2xl">
        <div className="border-b border-border px-5 py-3">
          <h2 className="text-sm font-semibold text-foreground">Warbixinnadii hore</h2>
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
            <EmptyState icon={Wallet} title="Weli warbixin lacag-bixin lama dirin" />
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
                      {soDate(s.createdAt)}
                      {s.providerTransactionReference ? ` · Tixraac: ${s.providerTransactionReference}` : ""}
                    </p>
                    {s.status === "REJECTED" && s.rejectionReason && (
                      <p className="mt-1 text-sm text-danger">Sababta: {s.rejectionReason}</p>
                    )}
                  </div>
                  <Badge tone={SUBMISSION_STATUS_TONE[s.status]}>{soStatus(SO_SUBMISSION_STATUS, s.status)}</Badge>
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
            <th className="px-5 py-2.5">Lacagta</th>
            <th className="px-5 py-2.5">Qadarka</th>
            <th className="px-5 py-2.5">La bixiyay</th>
            <th className="px-5 py-2.5">Haraaga</th>
            <th className="px-5 py-2.5">Xaaladda</th>
            <th className="px-5 py-2.5">Waqtiga bixinta</th>
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
                <Badge tone={STATUS_TONE[i.status]}>{soStatus(SO_INVOICE_STATUS, i.status)}</Badge>
              </td>
              <td className="px-5 py-3 text-foreground-muted">{i.dueDate ? soDate(i.dueDate) : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
