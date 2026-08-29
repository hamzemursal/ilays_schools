"use client";

import { use, useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useAuth, ApiError } from "@/lib/auth-context";
import {
  api,
  type AcademicYear,
  type ClassWithSections,
  type FeeStructure,
  type PaymentMethod,
  type SchoolInvoice,
} from "@/lib/api";

export default function FinancePage({ params }: { params: Promise<{ id: string }> }) {
  const { id: schoolId } = use(params);
  const router = useRouter();
  const { user, accessToken, loading } = useAuth();

  const [years, setYears] = useState<AcademicYear[]>([]);
  const [classes, setClasses] = useState<ClassWithSections[]>([]);
  const [feeStructures, setFeeStructures] = useState<FeeStructure[]>([]);
  const [invoices, setInvoices] = useState<SchoolInvoice[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) router.push("/login");
  }, [loading, user, router]);

  useEffect(() => {
    if (!accessToken) return;
    Promise.all([
      api.listAcademicYears(accessToken, schoolId),
      api.listClasses(accessToken, schoolId),
      api.listFeeStructures(accessToken, schoolId),
      api.listSchoolInvoices(accessToken, schoolId),
    ])
      .then(([y, c, fs, inv]) => {
        setYears(y);
        setClasses(c);
        setFeeStructures(fs);
        setInvoices(inv);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load finance data"));
  }, [accessToken, schoolId]);

  if (loading || !user) return <p className="p-8 text-foreground-soft">Loading…</p>;
  if (error) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
        <p className="rounded-lg bg-danger-soft px-4 py-3 text-danger">{error}</p>
      </div>
    );
  }

  const canManageFees = user.permissions.includes("fees.manage");
  const canRecordPayments = user.permissions.includes("payments.record");
  const schoolName = user.schools.find((s) => s.id === schoolId)?.name ?? "School";

  async function refreshInvoices() {
    if (!accessToken) return;
    setInvoices(await api.listSchoolInvoices(accessToken, schoolId));
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6 sm:py-16">
      <span className="text-sm font-semibold uppercase tracking-wide text-accent">Finance</span>
      <h1 className="mt-1 text-2xl font-semibold text-foreground">{schoolName}</h1>

      <FeeStructuresSection
        schoolId={schoolId}
        accessToken={accessToken!}
        years={years}
        classes={classes}
        feeStructures={feeStructures}
        setFeeStructures={setFeeStructures}
        onGenerated={refreshInvoices}
        canManage={canManageFees}
      />

      <InvoicesSection
        accessToken={accessToken!}
        invoices={invoices}
        setInvoices={setInvoices}
        canRecordPayments={canRecordPayments}
      />
    </div>
  );
}

function FeeStructuresSection({
  schoolId,
  accessToken,
  years,
  classes,
  feeStructures,
  setFeeStructures,
  onGenerated,
  canManage,
}: {
  schoolId: string;
  accessToken: string;
  years: AcademicYear[];
  classes: ClassWithSections[];
  feeStructures: FeeStructure[];
  setFeeStructures: (fn: (prev: FeeStructure[]) => FeeStructure[]) => void;
  onGenerated: () => void;
  canManage: boolean;
}) {
  const [academicYearId, setAcademicYearId] = useState(years[0]?.id ?? "");
  const [classId, setClassId] = useState("");
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [generating, setGenerating] = useState<string | null>(null);
  const [generateResult, setGenerateResult] = useState<Record<string, string>>({});

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    try {
      const fee = await api.createFeeStructure(accessToken, schoolId, {
        academicYearId,
        classId: classId || undefined,
        name,
        amount: Number(amount),
      });
      setFeeStructures((prev) => [fee, ...prev]);
      setName("");
      setAmount("");
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Failed to create fee");
    }
  }

  async function onGenerate(feeStructureId: string) {
    setGenerating(feeStructureId);
    try {
      const result = await api.generateInvoices(accessToken, schoolId, feeStructureId);
      setGenerateResult((prev) => ({
        ...prev,
        [feeStructureId]: `${result.createdCount} invoice(s) created (${result.eligibleEnrollments} eligible)`,
      }));
      onGenerated();
    } catch (err) {
      setGenerateResult((prev) => ({
        ...prev,
        [feeStructureId]: err instanceof ApiError ? err.message : "Failed to generate invoices",
      }));
    } finally {
      setGenerating(null);
    }
  }

  return (
    <section className="mt-8">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-foreground-soft">Fee structures</h2>

      <div className="mt-2 space-y-2">
        {feeStructures.map((fs) => (
          <div
            key={fs.id}
            className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-4 sm:flex-row sm:items-center sm:justify-between"
          >
            <div>
              <p className="font-medium text-foreground">{fs.name}</p>
              <p className="text-sm text-foreground-soft">
                {fs.academicYear.name} · {fs.class ? fs.class.name : "Whole school"} · ${fs.amount}
              </p>
            </div>
            {canManage && (
              <div className="flex flex-col items-start gap-1 sm:items-end">
                <button
                  onClick={() => onGenerate(fs.id)}
                  disabled={generating === fs.id}
                  className="rounded-lg border border-border px-3 py-1.5 text-sm text-foreground hover:border-accent disabled:opacity-60"
                >
                  {generating === fs.id ? "Generating…" : "Generate invoices"}
                </button>
                {generateResult[fs.id] && (
                  <span className="text-xs text-foreground-soft">{generateResult[fs.id]}</span>
                )}
              </div>
            )}
          </div>
        ))}
        {feeStructures.length === 0 && <p className="text-sm text-foreground-soft">No fees set up yet.</p>}
      </div>

      {canManage && years.length > 0 && (
        <form onSubmit={onCreate} className="mt-3 flex flex-wrap items-end gap-2 rounded-xl border border-border bg-surface p-4">
          <div>
            <label className="block text-xs font-medium text-foreground-soft">Year</label>
            <select
              value={academicYearId}
              onChange={(e) => setAcademicYearId(e.target.value)}
              className="mt-1 rounded-lg border border-border bg-background px-2 py-1.5 text-foreground outline-none focus:border-accent"
            >
              {years.map((y) => (
                <option key={y.id} value={y.id}>
                  {y.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-foreground-soft">Class (optional)</label>
            <select
              value={classId}
              onChange={(e) => setClassId(e.target.value)}
              className="mt-1 rounded-lg border border-border bg-background px-2 py-1.5 text-foreground outline-none focus:border-accent"
            >
              <option value="">Whole school</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-foreground-soft">Name</label>
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Tuition Term 1"
              className="mt-1 w-40 rounded-lg border border-border bg-background px-2 py-1.5 text-foreground outline-none focus:border-accent"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-foreground-soft">Amount</label>
            <input
              required
              type="number"
              min={1}
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="150"
              className="mt-1 w-28 rounded-lg border border-border bg-background px-2 py-1.5 text-foreground outline-none focus:border-accent"
            />
          </div>
          <button type="submit" className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white hover:opacity-90">
            Add fee
          </button>
          {formError && <p className="w-full text-sm text-danger">{formError}</p>}
        </form>
      )}
    </section>
  );
}

function InvoicesSection({
  accessToken,
  invoices,
  setInvoices,
  canRecordPayments,
}: {
  accessToken: string;
  invoices: SchoolInvoice[];
  setInvoices: (fn: (prev: SchoolInvoice[]) => SchoolInvoice[]) => void;
  canRecordPayments: boolean;
}) {
  const [openInvoiceId, setOpenInvoiceId] = useState<string | null>(null);

  const statusStyle: Record<string, string> = {
    UNPAID: "bg-danger-soft text-danger",
    PARTIALLY_PAID: "bg-warning-soft text-warning",
    PAID: "bg-success-soft text-success",
  };

  return (
    <section className="mt-8">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-foreground-soft">Invoices</h2>

      <div className="mt-2 space-y-2">
        {invoices.map((inv) => (
          <div key={inv.id} className="rounded-xl border border-border bg-surface p-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-medium text-foreground">
                  {inv.firstName} {inv.lastName}
                </p>
                <p className="text-sm text-foreground-soft">
                  {inv.feeStructure.name} · ${inv.amount} · balance ${inv.balance.toFixed(2)}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className={`rounded-full px-3 py-1 text-xs font-medium ${statusStyle[inv.status]}`}>
                  {inv.status.replace("_", " ")}
                </span>
                {canRecordPayments && inv.status !== "PAID" && (
                  <button
                    onClick={() => setOpenInvoiceId(openInvoiceId === inv.id ? null : inv.id)}
                    className="rounded-lg border border-border px-3 py-1 text-sm text-foreground hover:border-accent"
                  >
                    {openInvoiceId === inv.id ? "Cancel" : "Record payment"}
                  </button>
                )}
              </div>
            </div>

            {openInvoiceId === inv.id && (
              <RecordPaymentForm
                accessToken={accessToken}
                invoice={inv}
                onRecorded={(updatedInvoice) => {
                  setInvoices((prev) => prev.map((i) => (i.id === inv.id ? { ...i, ...updatedInvoice } : i)));
                  setOpenInvoiceId(null);
                }}
              />
            )}
          </div>
        ))}
        {invoices.length === 0 && <p className="text-sm text-foreground-soft">No invoices yet.</p>}
      </div>
    </section>
  );
}

function RecordPaymentForm({
  accessToken,
  invoice,
  onRecorded,
}: {
  accessToken: string;
  invoice: SchoolInvoice;
  onRecorded: (patch: Partial<SchoolInvoice>) => void;
}) {
  const [amount, setAmount] = useState(invoice.balance.toString());
  const [method, setMethod] = useState<PaymentMethod>("CASH");
  const [reference, setReference] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await api.recordPayment(accessToken, invoice.id, {
        amount: Number(amount),
        method,
        reference: reference || undefined,
      });
      const paid = invoice.paid + Number(amount);
      const balance = invoice.amount - paid;
      onRecorded({ paid, balance, status: balance <= 0 ? "PAID" : "PARTIALLY_PAID" });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to record payment");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="mt-3 flex flex-wrap items-end gap-2 border-t border-border pt-3">
      <div>
        <label className="block text-xs font-medium text-foreground-soft">Amount</label>
        <input
          required
          type="number"
          min={0.01}
          step="0.01"
          max={invoice.balance}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="mt-1 w-28 rounded-lg border border-border bg-background px-2 py-1.5 text-foreground outline-none focus:border-accent"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-foreground-soft">Method</label>
        <select
          value={method}
          onChange={(e) => setMethod(e.target.value as PaymentMethod)}
          className="mt-1 rounded-lg border border-border bg-background px-2 py-1.5 text-foreground outline-none focus:border-accent"
        >
          <option value="CASH">Cash</option>
          <option value="BANK_TRANSFER">Bank transfer</option>
          <option value="MOBILE_MONEY">Mobile money</option>
          <option value="CARD">Card</option>
          <option value="OTHER">Other</option>
        </select>
      </div>
      <div>
        <label className="block text-xs font-medium text-foreground-soft">Reference (optional)</label>
        <input
          value={reference}
          onChange={(e) => setReference(e.target.value)}
          placeholder="Receipt #"
          className="mt-1 w-32 rounded-lg border border-border bg-background px-2 py-1.5 text-foreground outline-none focus:border-accent"
        />
      </div>
      <button
        type="submit"
        disabled={submitting}
        className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60"
      >
        {submitting ? "Saving…" : "Save payment"}
      </button>
      {error && <p className="w-full text-sm text-danger">{error}</p>}
    </form>
  );
}
