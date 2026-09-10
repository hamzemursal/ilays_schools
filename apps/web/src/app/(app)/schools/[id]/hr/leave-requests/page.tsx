"use client";

import { use, useCallback, useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { useAuth, ApiError } from "@/lib/auth-context";
import type { LeaveRequest } from "@/lib/api";
import { leaveRequestsApi } from "@/features/hr/api";
import { LeaveRequestsTable } from "@/features/hr/leave-requests/LeaveRequestsTable";
import { CreateLeaveRequestForm } from "@/features/hr/leave-requests/CreateLeaveRequestForm";
import { RejectLeaveRequestDialog } from "@/features/hr/leave-requests/RejectLeaveRequestDialog";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { useToast } from "@/components/ui/Toast";

export default function LeaveRequestsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: schoolId } = use(params);
  const { user, accessToken } = useAuth();
  const { show } = useToast();
  const schoolName = user?.schools.find((s) => s.id === schoolId)?.name ?? "School";

  const [requests, setRequests] = useState<LeaveRequest[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [rejecting, setRejecting] = useState<LeaveRequest | null>(null);
  const [rejectSaving, setRejectSaving] = useState(false);

  const load = useCallback(() => {
    if (!accessToken) return;
    leaveRequestsApi
      .list(accessToken, schoolId)
      .then(setRequests)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load leave requests"));
  }, [accessToken, schoolId]);

  useEffect(load, [load]);

  const canManage = user?.permissions.includes("hr.leave.manage") ?? false;
  const canApprove = user?.permissions.includes("hr.leave.approve") ?? false;

  async function onApprove(r: LeaveRequest) {
    if (!accessToken) return;
    try {
      const updated = await leaveRequestsApi.approve(accessToken, schoolId, r.id);
      setRequests((prev) => prev?.map((x) => (x.id === r.id ? updated : x)) ?? prev);
      show("Leave request approved.");
    } catch (err) {
      show(err instanceof ApiError ? err.message : "Failed to approve leave request", "danger");
    }
  }

  async function onReject(reason: string) {
    if (!accessToken || !rejecting) return;
    setRejectSaving(true);
    try {
      const updated = await leaveRequestsApi.reject(accessToken, schoolId, rejecting.id, reason);
      setRequests((prev) => prev?.map((x) => (x.id === rejecting.id ? updated : x)) ?? prev);
      show("Leave request rejected.");
      setRejecting(null);
    } catch (err) {
      show(err instanceof ApiError ? err.message : "Failed to reject leave request", "danger");
    } finally {
      setRejectSaving(false);
    }
  }

  function employeeName(r: LeaveRequest): string {
    const person = r.teacher ?? r.staff;
    return person ? `${person.firstName} ${person.lastName}` : "this employee";
  }

  return (
    <div>
      <PageHeader
        eyebrow="HR"
        title={schoolName}
        breadcrumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "Leave Requests" }]}
        actions={
          canManage &&
          !showCreate && (
            <Button icon={<Plus className="size-4" />} onClick={() => setShowCreate(true)}>
              New leave request
            </Button>
          )
        }
      />
      <div className="space-y-5 p-4 sm:p-6">
        {error && <Alert tone="danger">{error}</Alert>}

        {showCreate && accessToken && (
          <CreateLeaveRequestForm
            accessToken={accessToken}
            schoolId={schoolId}
            onCreated={() => {
              setShowCreate(false);
              load();
            }}
            onCancel={() => setShowCreate(false)}
          />
        )}

        <LeaveRequestsTable
          requests={requests}
          loading={!requests}
          canApprove={canApprove}
          onApprove={onApprove}
          onReject={setRejecting}
        />
      </div>

      <RejectLeaveRequestDialog
        open={rejecting !== null}
        employeeName={rejecting ? employeeName(rejecting) : ""}
        loading={rejectSaving}
        onConfirm={onReject}
        onCancel={() => setRejecting(null)}
      />
    </div>
  );
}
