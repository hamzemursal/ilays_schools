"use client";

import { useEffect, useState, type FormEvent } from "react";
import type { Expense, ExpenseCategory, ExpenseStatus } from "@/lib/api";
import { api } from "@/lib/api";
import { ApiError } from "@/lib/auth-context";
import { Card, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { EmptyState } from "@/components/ui/EmptyState";
import { FormField, Input, Select } from "@/components/ui/FormControls";
import { useToast } from "@/components/ui/Toast";
import { ReasonPromptDialog } from "@/components/ui/ReasonPromptDialog";
import { Check, Plus, X } from "lucide-react";

const STATUS_TONE: Record<ExpenseStatus, "warning" | "success" | "danger" | "neutral"> = {
  PENDING: "warning",
  APPROVED: "success",
  REJECTED: "danger",
  PAID: "neutral",
};

export function ExpensesTab({
  accessToken,
  schoolId,
  canCreate,
  canApprove,
}: {
  accessToken: string;
  schoolId: string;
  canCreate: boolean;
  canApprove: boolean;
}) {
  const { show } = useToast();
  const [expenses, setExpenses] = useState<Expense[] | null>(null);
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<Expense | null>(null);

  function load() {
    api
      .listExpenses(accessToken, schoolId)
      .then(setExpenses)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load expenses"));
  }

  useEffect(load, [accessToken, schoolId]);
  useEffect(() => {
    api.listExpenseCategories(accessToken, schoolId).then(setCategories).catch(() => setCategories([]));
  }, [accessToken, schoolId]);

  async function onApprove(id: string) {
    setBusyId(id);
    try {
      await api.approveExpense(accessToken, schoolId, id);
      show("Expense approved.");
      load();
    } catch (err) {
      show(err instanceof ApiError ? err.message : "Failed to approve expense", "danger");
    } finally {
      setBusyId(null);
    }
  }

  async function onReject(reason: string) {
    if (!rejecting) return;
    setBusyId(rejecting.id);
    try {
      await api.rejectExpense(accessToken, schoolId, rejecting.id, reason);
      show("Expense rejected.");
      setRejecting(null);
      load();
    } catch (err) {
      show(err instanceof ApiError ? err.message : "Failed to reject expense", "danger");
    } finally {
      setBusyId(null);
    }
  }

  async function onMarkPaid(id: string) {
    setBusyId(id);
    try {
      await api.markExpensePaid(accessToken, schoolId, id);
      show("Expense marked as paid.");
      load();
    } catch (err) {
      show(err instanceof ApiError ? err.message : "Failed to mark expense paid", "danger");
    } finally {
      setBusyId(null);
    }
  }

  if (error) return <Alert tone="danger">{error}</Alert>;

  return (
    <section className="space-y-4">
      <div>
        <h2 className="mb-3 text-sm font-semibold text-foreground">Expenses</h2>
        {!expenses ? (
          <p className="text-sm text-foreground-muted">Loading…</p>
        ) : expenses.length === 0 ? (
          <EmptyState title="No expenses recorded yet" />
        ) : (
          <div className="space-y-2">
            {expenses.map((e) => (
              <Card key={e.id} padding="sm">
                <div className="flex items-center justify-between p-2">
                  <div>
                    <p className="font-medium text-foreground">{e.description}</p>
                    <p className="text-sm text-foreground-soft">
                      {e.expenseCategory?.name ?? "Uncategorized"} · ${e.amount} · {new Date(e.expenseDate).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge tone={STATUS_TONE[e.status]}>{e.status}</Badge>
                    {canApprove && e.status === "PENDING" && (
                      <>
                        <Button size="sm" variant="outline" icon={<Check className="size-3.5" />} loading={busyId === e.id} onClick={() => onApprove(e.id)}>
                          Approve
                        </Button>
                        <Button size="sm" variant="ghost" icon={<X className="size-3.5" />} onClick={() => setRejecting(e)}>
                          Reject
                        </Button>
                      </>
                    )}
                    {canApprove && e.status === "APPROVED" && (
                      <Button size="sm" variant="outline" loading={busyId === e.id} onClick={() => onMarkPaid(e.id)}>
                        Mark paid
                      </Button>
                    )}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      {canCreate && (
        <CreateExpenseForm
          accessToken={accessToken}
          schoolId={schoolId}
          categories={categories}
          onCategoryAdded={(c) => setCategories((prev) => [...prev, c])}
          onCreated={load}
        />
      )}

      <ReasonPromptDialog
        open={rejecting !== null}
        title={rejecting ? `Reject "${rejecting.description}"?` : ""}
        confirmLabel="Reject"
        loading={busyId === rejecting?.id}
        onConfirm={onReject}
        onCancel={() => setRejecting(null)}
      />
    </section>
  );
}

function CreateExpenseForm({
  accessToken,
  schoolId,
  categories,
  onCategoryAdded,
  onCreated,
}: {
  accessToken: string;
  schoolId: string;
  categories: ExpenseCategory[];
  onCategoryAdded: (c: ExpenseCategory) => void;
  onCreated: () => void;
}) {
  const { show } = useToast();
  const [expenseCategoryId, setExpenseCategoryId] = useState("");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [expenseDate, setExpenseDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [newCategory, setNewCategory] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onAddCategory() {
    if (!newCategory.trim()) return;
    try {
      const category = await api.createExpenseCategory(accessToken, schoolId, newCategory.trim());
      onCategoryAdded(category);
      setExpenseCategoryId(category.id);
      setNewCategory("");
    } catch (err) {
      show(err instanceof ApiError ? err.message : "Failed to add category", "danger");
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await api.createExpense(accessToken, schoolId, {
        expenseCategoryId: expenseCategoryId || undefined,
        description,
        amount: Number(amount),
        expenseDate,
      });
      setDescription("");
      setAmount("");
      onCreated();
      show("Expense recorded — pending approval.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to record expense");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card padding="none">
      <CardHeader title="Record expense" description="Recorded as PENDING — requires approval before it counts toward the dashboard." />
      <form onSubmit={onSubmit} className="space-y-4 p-5">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <FormField label="Category">
            <div className="flex gap-2">
              <Select value={expenseCategoryId} onChange={(e) => setExpenseCategoryId(e.target.value)} className="flex-1">
                <option value="">Uncategorized</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </div>
          </FormField>
          <FormField label="New category (optional)">
            <div className="flex gap-2">
              <Input value={newCategory} onChange={(e) => setNewCategory(e.target.value)} placeholder="e.g. Maintenance" />
              <Button type="button" size="sm" variant="outline" icon={<Plus className="size-4" />} onClick={onAddCategory}>
                Add
              </Button>
            </div>
          </FormField>
          <FormField label="Description" className="sm:col-span-2">
            <Input required value={description} onChange={(e) => setDescription(e.target.value)} />
          </FormField>
          <FormField label="Amount">
            <Input required type="number" min={0.01} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </FormField>
          <FormField label="Date">
            <Input required type="date" value={expenseDate} onChange={(e) => setExpenseDate(e.target.value)} />
          </FormField>
        </div>

        {error && <Alert tone="danger">{error}</Alert>}

        <Button type="submit" icon={<Plus className="size-4" />} loading={saving}>
          Record expense
        </Button>
      </form>
    </Card>
  );
}
