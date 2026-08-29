"use client";

import { use, useEffect, useState, type FormEvent } from "react";
import { useAuth, ApiError } from "@/lib/auth-context";
import {
  api,
  type AcademicYear,
  type ClassWithSections,
  type FeeStructure,
  type PaymentMethod,
  type SchoolInvoice,
} from "@/lib/api";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { EmptyState } from "@/components/ui/EmptyState";
import { FormField, Input, Select } from "@/components/ui/FormControls";
import { SkeletonCards } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import { Download, Plus } from "lucide-react";

export default function FinancePage({ params }: { params: Promise<{ id: string }> }) {
  const { id: schoolId } = use(params);
  const { user, accessToken } = useAuth();

  const [years, setYears] = useState<AcademicYear[]>([]);
  const [classes, setClasses] = useState<ClassWithSections[]>([]);
  const [feeStructures, setFeeStructures] = useState<FeeStructure[]>([]);
  const [invoices, setInvoices] = useState<SchoolInvoice[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
        setLoaded(true);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load finance data"));
  }, [accessToken, schoolId]);

  const canManageFees = user?.permissions.includes("fees.manage") ?? false;
  const canRecordPayments = user?.permissions.includes("payments.record") ?? false;
  const schoolName = user?.schools.find((s) => s.id === schoolId)?.name ?? "School";

  async function refreshInvoices() {
    if (!accessToken) return;
    setInvoices(await api.listSchoolInvoices(accessToken, schoolId));
  }

  return (
    <div>
      <PageHeader
        eyebrow="Finance"
        title={schoolName}
        breadcrumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "Finance" }]}
      />

      <div className="space-y-6 p-4 sm:p-6">
        {error ? (
          <Alert tone="danger">{error}</Alert>
        ) : !loaded ? (
          <SkeletonCards count={3} />
        ) : (
          <>
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
              schoolId={schoolId}
              accessToken={accessToken!}
              invoices={invoices}
              setInvoices={setInvoices}
              canRecordPayments={canRecordPayments}
              canExport={user?.permissions.includes("exports.create") ?? false}
            />
          </>
        )}
      </div>
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
  const { show } = useToast();

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
      show(`${fee.name} added.`);
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
    <section>
      <h2 className="mb-3 text-sm font-semibold text-foreground">Fee structures</h2>

      {feeStructures.length === 0 ? (
        <EmptyState title="No fees set up yet" description="Create a fee structure to start generating invoices." />
      ) : (
        <div className="space-y-2">
          {feeStructures.map((fs) => (
            <Card key={fs.id} padding="sm">
              <div className="flex flex-col gap-2 p-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-medium text-foreground">{fs.name}</p>
                  <p className="text-sm text-foreground-soft">
                    {fs.academicYear.name} · {fs.class ? fs.class.name : "Whole school"} · ${fs.amount}
                  </p>
                </div>
                {canManage && (
                  <div className="flex flex-col items-start gap-1 sm:items-end">
                    <Button size="sm" variant="outline" loading={generating === fs.id} onClick={() => onGenerate(fs.id)}>
                      Generate invoices
                    </Button>
                    {generateResult[fs.id] && <span className="text-xs text-foreground-muted">{generateResult[fs.id]}</span>}
                  </div>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      {canManage && years.length > 0 && (
        <Card className="mt-4">
          <h3 className="text-sm font-semibold text-foreground">Add fee structure</h3>
          <form onSubmit={onCreate} className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-4">
            <FormField label="Year">
              <Select value={academicYearId} onChange={(e) => setAcademicYearId(e.target.value)}>
                {years.map((y) => (
                  <option key={y.id} value={y.id}>
                    {y.name}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label="Class (optional)">
              <Select value={classId} onChange={(e) => setClassId(e.target.value)}>
                <option value="">Whole school</option>
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label="Name">
              <Input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Tuition Term 1" />
            </FormField>
            <FormField label="Amount">
              <Input required type="number" min={1} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="150" />
            </FormField>
            <div className="sm:col-span-4">
              <Button type="submit" icon={<Plus className="size-4" />}>
                Add fee
              </Button>
            </div>
            {formError && <Alert tone="danger" className="sm:col-span-4">{formError}</Alert>}
          </form>
        </Card>
      )}
    </section>
  );
}

const STATUS_TONE: Record<SchoolInvoice["status"], "danger" | "warning" | "success"> = {
  UNPAID: "danger",
  PARTIALLY_PAID: "warning",
  PAID: "success",
};

function InvoicesSection({
  schoolId,
  accessToken,
  invoices,
  setInvoices,
  canRecordPayments,
  canExport,
}: {
  schoolId: string;
  accessToken: string;
  invoices: SchoolInvoice[];
  setInvoices: (fn: (prev: SchoolInvoice[]) => SchoolInvoice[]) => void;
  canRecordPayments: boolean;
  canExport: boolean;
}) {
  const [openInvoiceId, setOpenInvoiceId] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const { show } = useToast();

  async function onExport() {
    setExporting(true);
    try {
      await api.exportInvoices(accessToken, schoolId);
    } catch (err) {
      show(err instanceof ApiError ? err.message : "Failed to export invoices", "danger");
    } finally {
      setExporting(false);
    }
  }

  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground">Invoices</h2>
        {canExport && (
          <Button size="sm" variant="outline" icon={<Download className="size-4" />} loading={exporting} onClick={onExport}>
            Export
          </Button>
        )}
      </div>

      {invoices.length === 0 ? (
        <EmptyState title="No invoices yet" description="Generate invoices from a fee structure above." />
      ) : (
        <div className="space-y-2">
          {invoices.map((inv) => (
            <Card key={inv.id} padding="sm">
              <div className="flex flex-col gap-2 p-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-medium text-foreground">
                    {inv.firstName} {inv.lastName}
                  </p>
                  <p className="text-sm text-foreground-soft">
                    {inv.feeStructure.name} · ${inv.amount} · balance ${inv.balance.toFixed(2)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone={STATUS_TONE[inv.status]}>{inv.status.replace("_", " ")}</Badge>
                  {canRecordPayments && inv.status !== "PAID" && (
                    <Button size="sm" variant="outline" onClick={() => setOpenInvoiceId(openInvoiceId === inv.id ? null : inv.id)}>
                      {openInvoiceId === inv.id ? "Cancel" : "Record payment"}
                    </Button>
                  )}
                </div>
              </div>

              {openInvoiceId === inv.id && (
                <div className="px-2 pb-2">
                  <RecordPaymentForm
                    accessToken={accessToken}
                    invoice={inv}
                    onRecorded={(updatedInvoice) => {
                      setInvoices((prev) => prev.map((i) => (i.id === inv.id ? { ...i, ...updatedInvoice } : i)));
                      setOpenInvoiceId(null);
                    }}
                  />
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
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
  const { show } = useToast();

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await api.recordPayment(accessToken, invoice.id, { amount: Number(amount), method, reference: reference || undefined });
      const paid = invoice.paid + Number(amount);
      const balance = invoice.amount - paid;
      onRecorded({ paid, balance, status: balance <= 0 ? "PAID" : "PARTIALLY_PAID" });
      show("Payment recorded.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to record payment");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="grid grid-cols-1 gap-3 border-t border-border pt-3 sm:grid-cols-4">
      <FormField label="Amount">
        <Input required type="number" min={0.01} step="0.01" max={invoice.balance} value={amount} onChange={(e) => setAmount(e.target.value)} />
      </FormField>
      <FormField label="Method">
        <Select value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
          <option value="CASH">Cash</option>
          <option value="BANK_TRANSFER">Bank transfer</option>
          <option value="MOBILE_MONEY">Mobile money</option>
          <option value="CARD">Card</option>
          <option value="OTHER">Other</option>
        </Select>
      </FormField>
      <FormField label="Reference (optional)">
        <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Receipt #" />
      </FormField>
      <div className="flex items-end">
        <Button type="submit" loading={submitting} className="w-full">
          Save payment
        </Button>
      </div>
      {error && <Alert tone="danger" className="sm:col-span-4">{error}</Alert>}
    </form>
  );
}
