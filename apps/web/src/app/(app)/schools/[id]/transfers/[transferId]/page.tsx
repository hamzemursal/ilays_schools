"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Check, FileText, GraduationCap, UserCircle, X, XCircle } from "lucide-react";
import { ApiError, useAuth } from "@/lib/auth-context";
import { api, type Transfer, type TransferEnrollmentSnapshot } from "@/lib/api";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { SkeletonCards } from "@/components/ui/Skeleton";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useToast } from "@/components/ui/Toast";
import { ApproveTransferForm } from "@/features/transfers/components/ApproveTransferForm";
import { RejectTransferDialog } from "@/features/transfers/components/RejectTransferDialog";
import { TransferStatusBadge } from "@/features/transfers/TransferBadges";

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-foreground-muted">{label}</p>
      <p className="mt-1 text-sm text-foreground">{value}</p>
    </div>
  );
}

function EnrollmentCard({ title, snapshot, schoolName }: { title: string; snapshot: TransferEnrollmentSnapshot; schoolName: string }) {
  return (
    <Card padding="none">
      <CardHeader title={title} />
      <div className="grid grid-cols-2 gap-4 p-5 sm:grid-cols-4">
        <Field label="School" value={schoolName} />
        <Field label="Academic year" value={snapshot.academicYear.name} />
        <Field label="Class" value={snapshot.class.name} />
        <Field label="Section" value={snapshot.section.name} />
        <Field label="Student number" value={snapshot.studentNumber} />
      </div>
    </Card>
  );
}

export default function TransferDetailsPage({ params }: { params: Promise<{ id: string; transferId: string }> }) {
  const { id: schoolId, transferId } = use(params);
  const { user, accessToken } = useAuth();
  const { show } = useToast();

  const [transfer, setTransfer] = useState<Transfer | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [approving, setApproving] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [rejectConfirming, setRejectConfirming] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [cancelConfirming, setCancelConfirming] = useState(false);

  useEffect(() => {
    if (!accessToken) return;
    api
      .getTransfer(accessToken, transferId)
      .then(setTransfer)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load transfer"));
  }, [accessToken, transferId]);

  const canApprove = user?.permissions.includes("transfers.approve") ?? false;
  const canCreate = user?.permissions.includes("transfers.create") ?? false;

  async function onReject(reason: string) {
    if (!accessToken || !transfer) return;
    setRejecting(true);
    try {
      const updated = await api.rejectTransfer(accessToken, transfer.id, { reason });
      setTransfer(updated);
      show("Transfer rejected.");
    } catch (err) {
      show(err instanceof ApiError ? err.message : "Failed to reject transfer", "danger");
    } finally {
      setRejecting(false);
      setRejectConfirming(false);
    }
  }

  async function onCancel() {
    if (!accessToken || !transfer) return;
    setCancelling(true);
    try {
      const updated = await api.cancelTransfer(accessToken, transfer.id);
      setTransfer(updated);
      show("Transfer request cancelled.");
    } catch (err) {
      show(err instanceof ApiError ? err.message : "Failed to cancel transfer", "danger");
    } finally {
      setCancelling(false);
      setCancelConfirming(false);
    }
  }

  const isIncomingPending = !!transfer && transfer.status === "REQUESTED" && transfer.toSchoolId === schoolId;
  const isOutgoingPending = !!transfer && transfer.status === "REQUESTED" && transfer.fromSchoolId === schoolId;

  return (
    <div>
      <PageHeader
        eyebrow="Transfer"
        title={transfer ? `${transfer.student.firstName} ${transfer.student.lastName}` : "Transfer"}
        breadcrumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Transfers", href: `/schools/${schoolId}/transfers` },
          { label: transfer ? `${transfer.student.firstName} ${transfer.student.lastName}` : "Details" },
        ]}
        actions={
          transfer && (
            <div className="flex items-center gap-2">
              {canApprove && isIncomingPending && !approving && (
                <>
                  <Button size="sm" icon={<Check className="size-4" />} onClick={() => setApproving(true)}>
                    Accept
                  </Button>
                  <Button size="sm" variant="outline" icon={<X className="size-4" />} onClick={() => setRejectConfirming(true)}>
                    Reject
                  </Button>
                </>
              )}
              {canCreate && isOutgoingPending && (
                <Button size="sm" variant="outline" icon={<XCircle className="size-4" />} onClick={() => setCancelConfirming(true)}>
                  Cancel request
                </Button>
              )}
            </div>
          )
        }
      />

      <div className="space-y-5 p-4 sm:p-6">
        {error ? (
          <Alert tone="danger">{error}</Alert>
        ) : !transfer ? (
          <SkeletonCards count={3} />
        ) : (
          <>
            <Card padding="none">
              <CardHeader title="Student Information" actions={<TransferStatusBadge status={transfer.status} />} />
              <div className="grid grid-cols-2 gap-4 p-5 sm:grid-cols-4">
                <Field label="Full name" value={`${transfer.student.firstName} ${transfer.student.lastName}`} />
                <Field label="Gender" value={transfer.student.sex === "MALE" ? "Male" : "Female"} />
                <Field label="Date of birth" value={new Date(transfer.student.dateOfBirth).toLocaleDateString()} />
                <Field
                  label="Student number"
                  value={transfer.toEnrollment?.studentNumber ?? transfer.fromEnrollment.studentNumber}
                />
              </div>
            </Card>

            <div className="flex items-center gap-3">
              <div className="h-px flex-1 bg-border" />
              <div className="flex items-center gap-2 text-sm font-medium text-foreground-soft">
                {transfer.fromSchoolName} <ArrowRight className="size-4" /> {transfer.toSchoolName}
              </div>
              <div className="h-px flex-1 bg-border" />
            </div>

            <EnrollmentCard title="Previous Enrollment (Origin)" snapshot={transfer.fromEnrollment} schoolName={transfer.fromSchoolName} />
            {transfer.toEnrollment ? (
              <EnrollmentCard title="Current Enrollment (Destination)" snapshot={transfer.toEnrollment} schoolName={transfer.toSchoolName} />
            ) : (
              <Card>
                <p className="text-sm text-foreground-soft">
                  No enrollment has been created at {transfer.toSchoolName} yet — this transfer is still{" "}
                  {transfer.status === "REQUESTED" ? "pending" : transfer.status.toLowerCase()}.
                </p>
              </Card>
            )}

            <Card padding="none">
              <CardHeader title="Request" />
              <div className="grid grid-cols-2 gap-4 p-5 sm:grid-cols-4">
                <Field label="Requested by" value={transfer.requestedByEmail} />
                <Field label="Requested" value={new Date(transfer.createdAt).toLocaleString()} />
                <Field label="Reason" value={transfer.reason ?? <span className="text-foreground-muted">Not provided</span>} />
              </div>
            </Card>

            <Card padding="none">
              <CardHeader title="Destination Decision" />
              <div className="grid grid-cols-2 gap-4 p-5 sm:grid-cols-4">
                <Field label="Status" value={<TransferStatusBadge status={transfer.status} />} />
                <Field label="Decision by" value={transfer.approvedByEmail ?? <span className="text-foreground-muted">—</span>} />
                <Field
                  label="Decision date"
                  value={transfer.transferDate ? new Date(transfer.transferDate).toLocaleString() : <span className="text-foreground-muted">—</span>}
                />
                <Field
                  label="Rejection reason"
                  value={transfer.rejectionReason ?? <span className="text-foreground-muted">—</span>}
                />
              </div>
              {transfer.status === "REQUESTED" && (
                <p className="border-t border-border px-5 py-3 text-sm text-foreground-soft">
                  Waiting for {transfer.toSchoolName} to accept or reject this request.
                </p>
              )}
            </Card>

            <Card padding="none">
              <CardHeader title="Academic History" description="Jump to this student's other records." />
              <div className="flex flex-wrap gap-3 p-5">
                <Link href={`/schools/${schoolId}/students/${transfer.student.id}`}>
                  <Button size="sm" variant="outline" icon={<UserCircle className="size-4" />}>
                    Full student profile
                  </Button>
                </Link>
              </div>
            </Card>

            <Card padding="none">
              <CardHeader title="Timeline" />
              <div className="space-y-4 p-5">
                <TimelineRow icon={FileText} label="Requested" by={transfer.requestedByEmail} at={transfer.createdAt} />
                {transfer.status === "EXECUTED" && transfer.approvedByEmail && (
                  <TimelineRow icon={GraduationCap} label="Accepted & completed" by={transfer.approvedByEmail} at={transfer.transferDate} />
                )}
                {transfer.status === "REJECTED" && (
                  <TimelineRow icon={XCircle} label={`Rejected${transfer.rejectionReason ? `: ${transfer.rejectionReason}` : ""}`} by={null} at={null} />
                )}
                {transfer.status === "CANCELLED" && <TimelineRow icon={XCircle} label="Cancelled by requester" by={null} at={null} />}
              </div>
            </Card>

            {approving && (
              <Card>
                <ApproveTransferForm
                  schoolId={schoolId}
                  transfer={transfer}
                  onCancel={() => setApproving(false)}
                  onDone={(updated) => {
                    setTransfer(updated);
                    setApproving(false);
                    show("Transfer accepted — student enrolled.");
                  }}
                />
              </Card>
            )}
          </>
        )}
      </div>

      <RejectTransferDialog
        open={rejectConfirming}
        studentName={transfer ? `${transfer.student.firstName} ${transfer.student.lastName}` : "This student"}
        loading={rejecting}
        onConfirm={onReject}
        onCancel={() => setRejectConfirming(false)}
      />

      <ConfirmDialog
        open={cancelConfirming}
        title="Cancel this transfer request?"
        description="The student stays enrolled at their current school. You can request a new transfer later."
        confirmLabel="Cancel request"
        loading={cancelling}
        onConfirm={onCancel}
        onCancel={() => setCancelConfirming(false)}
      />
    </div>
  );
}

function TimelineRow({
  icon: Icon,
  label,
  by,
  at,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  by: string | null;
  at: string | null;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent">
        <Icon className="size-4" />
      </div>
      <div>
        <p className="text-sm font-medium text-foreground">{label}</p>
        <p className="text-xs text-foreground-muted">
          {by && <>By {by}</>}
          {by && at && " · "}
          {at && new Date(at).toLocaleString()}
        </p>
      </div>
    </div>
  );
}
