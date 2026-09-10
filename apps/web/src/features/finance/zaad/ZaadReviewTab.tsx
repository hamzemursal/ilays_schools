"use client";

import { useEffect, useState } from "react";
import type { PaymentSubmission, PaymentSubmissionStatus, SchoolCharge, SchoolInvoice } from "@/lib/api";
import { api } from "@/lib/api";
import { ApiError } from "@/lib/auth-context";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { EmptyState } from "@/components/ui/EmptyState";
import { Select } from "@/components/ui/FormControls";
import { useToast } from "@/components/ui/Toast";
import { ReasonPromptDialog } from "@/components/ui/ReasonPromptDialog";
import { Check, X } from "lucide-react";

const STATUS_TONE: Record<PaymentSubmissionStatus, "warning" | "success" | "danger"> = {
  PENDING: "warning",
  VERIFIED: "success",
  REJECTED: "danger",
};

export function ZaadReviewTab({
  accessToken,
  schoolId,
  invoices,
  charges,
  canVerify,
}: {
  accessToken: string;
  schoolId: string;
  invoices: SchoolInvoice[];
  charges: SchoolCharge[];
  canVerify: boolean;
}) {
  const { show } = useToast();
  const [submissions, setSubmissions] = useState<PaymentSubmission[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [matchFor, setMatchFor] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<PaymentSubmission | null>(null);

  function load() {
    api
      .listPaymentSubmissions(accessToken, schoolId)
      .then(setSubmissions)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load ZAAD submissions"));
  }

  useEffect(load, [accessToken, schoolId]);

  const targets = [
    ...invoices.map((i) => ({ kind: "invoice" as const, id: i.id, studentId: i.studentId, label: `${i.feeStructure.name} — Invoice, $${i.amount}` })),
    ...charges.map((c) => ({ kind: "charge" as const, id: c.id, studentId: c.studentId, label: `${c.feeStructure.name} — Charge, $${c.amount}` })),
  ];

  async function onVerify(s: PaymentSubmission) {
    const key = matchFor[s.id];
    if (!key) {
      show("Select which invoice or charge this ZAAD payment is for", "danger");
      return;
    }
    const [kind, id] = key.split(":");
    setBusyId(s.id);
    try {
      await api.verifyPaymentSubmission(accessToken, schoolId, s.id, {
        invoiceId: kind === "invoice" ? id : undefined,
        chargeId: kind === "charge" ? id : undefined,
      });
      show("Payment verified and posted to the ledger.");
      load();
    } catch (err) {
      show(err instanceof ApiError ? err.message : "Failed to verify payment", "danger");
    } finally {
      setBusyId(null);
    }
  }

  async function onReject(reason: string) {
    if (!rejecting) return;
    setBusyId(rejecting.id);
    try {
      await api.rejectPaymentSubmission(accessToken, schoolId, rejecting.id, reason);
      show("Payment submission rejected.");
      setRejecting(null);
      load();
    } catch (err) {
      show(err instanceof ApiError ? err.message : "Failed to reject payment", "danger");
    } finally {
      setBusyId(null);
    }
  }

  if (error) return <Alert tone="danger">{error}</Alert>;

  return (
    <section>
      <h2 className="mb-3 text-sm font-semibold text-foreground">ZAAD payment review</h2>
      <p className="mb-3 text-sm text-foreground-soft">
        Payment notices submitted by parents (or logged directly by Finance for a deposit found in the school&apos;s ZAAD
        account) — pending until matched and verified against a real charge or invoice. A pending submission never
        reduces a student&apos;s balance.
      </p>

      {!submissions ? (
        <p className="text-sm text-foreground-muted">Loading…</p>
      ) : submissions.length === 0 ? (
        <EmptyState title="No ZAAD submissions" />
      ) : (
        <div className="space-y-2">
          {submissions.map((s) => {
            const studentTargets = targets.filter((t) => t.studentId === s.studentId);
            return (
              <Card key={s.id} padding="sm">
                <div className="flex flex-col gap-2 p-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="font-medium text-foreground">
                      {s.student ? `${s.student.firstName} ${s.student.lastName}` : "Student"} · ${s.amount}
                    </p>
                    <p className="text-sm text-foreground-soft">
                      {s.provider}
                      {s.providerTransactionReference ? ` · Ref: ${s.providerTransactionReference}` : ""}
                      {s.payerPhone ? ` · ${s.payerPhone}` : ""}
                    </p>
                    {s.rejectionReason && <p className="mt-1 text-xs text-danger">Rejected: {s.rejectionReason}</p>}
                  </div>
                  <Badge tone={STATUS_TONE[s.status]}>{s.status}</Badge>
                </div>

                {canVerify && s.status === "PENDING" && (
                  <div className="flex flex-wrap items-center gap-2 border-t border-border p-2 pt-3">
                    <Select
                      className="max-w-xs"
                      value={matchFor[s.id] ?? ""}
                      onChange={(e) => setMatchFor((prev) => ({ ...prev, [s.id]: e.target.value }))}
                    >
                      <option value="">Match to invoice/charge…</option>
                      {studentTargets.map((t) => (
                        <option key={`${t.kind}:${t.id}`} value={`${t.kind}:${t.id}`}>
                          {t.label}
                        </option>
                      ))}
                    </Select>
                    <Button size="sm" icon={<Check className="size-4" />} loading={busyId === s.id} onClick={() => onVerify(s)}>
                      Verify
                    </Button>
                    <Button size="sm" variant="ghost" icon={<X className="size-4" />} onClick={() => setRejecting(s)}>
                      Reject
                    </Button>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      <ReasonPromptDialog
        open={rejecting !== null}
        title={rejecting ? `Reject this $${rejecting.amount} ZAAD payment?` : ""}
        description="It will never post to the ledger. Provide a reason — e.g. transaction not found, amount mismatch, duplicate."
        confirmLabel="Reject"
        loading={busyId === rejecting?.id}
        onConfirm={onReject}
        onCancel={() => setRejecting(null)}
      />
    </section>
  );
}
