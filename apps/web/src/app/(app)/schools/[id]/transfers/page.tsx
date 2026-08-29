"use client";

import { use, useEffect, useState } from "react";
import { Check, X } from "lucide-react";
import { ApiError, useAuth } from "@/lib/auth-context";
import { api, type Transfer } from "@/lib/api";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { EmptyState } from "@/components/ui/EmptyState";
import { SkeletonTable } from "@/components/ui/Skeleton";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useToast } from "@/components/ui/Toast";
import { ApproveTransferForm } from "@/features/transfers/components/ApproveTransferForm";

const STATUS_TONE: Record<Transfer["status"], "warning" | "success" | "danger" | "accent"> = {
  REQUESTED: "warning",
  APPROVED: "accent",
  EXECUTED: "success",
  REJECTED: "danger",
};

export default function TransfersPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: schoolId } = use(params);
  const { user, accessToken } = useAuth();
  const { show } = useToast();

  const [transfers, setTransfers] = useState<Transfer[] | null>(null);
  const [schoolNames, setSchoolNames] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState(false);

  useEffect(() => {
    if (!accessToken) return;
    api
      .listTransfers(accessToken, schoolId)
      .then(setTransfers)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load transfers"));
    api
      .listSchoolDirectory(accessToken)
      .then((list) => setSchoolNames(Object.fromEntries(list.map((s) => [s.id, s.name]))))
      .catch(() => undefined);
  }, [accessToken, schoolId]);

  const canApprove = user?.permissions.includes("transfers.approve") ?? false;
  const schoolName = user?.schools.find((s) => s.id === schoolId)?.name ?? "School";

  async function onReject() {
    if (!accessToken || !rejectingId) return;
    setRejecting(true);
    try {
      const updated = await api.rejectTransfer(accessToken, rejectingId);
      setTransfers((prev) => prev?.map((t) => (t.id === updated.id ? updated : t)) ?? prev);
      show("Transfer rejected.");
    } catch (err) {
      show(err instanceof ApiError ? err.message : "Failed to reject transfer", "danger");
    } finally {
      setRejecting(false);
      setRejectingId(null);
    }
  }

  return (
    <div>
      <PageHeader
        eyebrow="Transfers"
        title={schoolName}
        description="Students moving between schools in the organization."
        breadcrumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "Transfers" }]}
      />

      <div className="p-4 sm:p-6">
        {error ? (
          <Alert tone="danger">{error}</Alert>
        ) : !transfers ? (
          <SkeletonTable cols={4} />
        ) : transfers.length === 0 ? (
          <EmptyState title="No transfers yet" description="Requests appear here once a student is transferred to or from this school." />
        ) : (
          <div className="space-y-3">
            {transfers.map((t) => {
              const isIncomingPending = t.status === "REQUESTED" && t.toSchoolId === schoolId;
              return (
                <Card key={t.id} padding="sm">
                  <div className="flex flex-wrap items-center justify-between gap-3 p-2">
                    <div>
                      <p className="font-medium text-foreground">
                        {t.student.firstName} {t.student.lastName}
                      </p>
                      <p className="text-sm text-foreground-soft">
                        {schoolNames[t.fromSchoolId] ?? "Unknown school"} → {schoolNames[t.toSchoolId] ?? "Unknown school"}
                      </p>
                      {t.reason && <p className="mt-0.5 text-xs text-foreground-muted">&ldquo;{t.reason}&rdquo;</p>}
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge tone={STATUS_TONE[t.status]}>{t.status}</Badge>
                      {canApprove && isIncomingPending && approvingId !== t.id && (
                        <>
                          <Button size="sm" icon={<Check className="size-4" />} onClick={() => setApprovingId(t.id)}>
                            Approve
                          </Button>
                          <Button size="sm" variant="outline" icon={<X className="size-4" />} onClick={() => setRejectingId(t.id)}>
                            Reject
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                  {approvingId === t.id && (
                    <div className="px-2 pb-2">
                      <ApproveTransferForm
                        schoolId={schoolId}
                        transfer={t}
                        onCancel={() => setApprovingId(null)}
                        onDone={(updated) => {
                          setTransfers((prev) => prev?.map((x) => (x.id === updated.id ? updated : x)) ?? prev);
                          setApprovingId(null);
                          show("Transfer approved.");
                        }}
                      />
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={!!rejectingId}
        title="Reject this transfer?"
        description="The student stays enrolled at their current school. This can't be undone."
        confirmLabel="Reject"
        loading={rejecting}
        onConfirm={onReject}
        onCancel={() => setRejectingId(null)}
      />
    </div>
  );
}
