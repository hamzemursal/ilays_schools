"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Cake, MapPin, Pencil, Phone, Power, ShieldAlert, Trash2, User } from "lucide-react";
import { ApiError, useAuth } from "@/lib/auth-context";
import type { Staff } from "@/lib/api";
import { staffApi } from "../api";
import { EditStaffForm } from "./EditStaffForm";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Avatar } from "@/components/ui/Avatar";
import { Alert } from "@/components/ui/Alert";
import { SkeletonCards } from "@/components/ui/Skeleton";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useToast } from "@/components/ui/Toast";

const STATUS_TONE: Record<Staff["status"], "success" | "warning" | "neutral"> = {
  ACTIVE: "success",
  ON_LEAVE: "warning",
  INACTIVE: "neutral",
};

export function StaffProfile({ schoolId, staffId }: { schoolId: string; staffId: string }) {
  const { user, accessToken } = useAuth();
  const { show } = useToast();
  const router = useRouter();

  const [staff, setStaff] = useState<Staff | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [showStatusConfirm, setShowStatusConfirm] = useState(false);
  const [togglingStatus, setTogglingStatus] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!accessToken) return;
    staffApi
      .getOne(accessToken, schoolId, staffId)
      .then(setStaff)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load staff member"));
  }, [accessToken, schoolId, staffId]);

  async function onToggleStatus() {
    if (!accessToken || !staff) return;
    setTogglingStatus(true);
    try {
      const nextStatus = staff.status === "INACTIVE" ? "ACTIVE" : "INACTIVE";
      const updated = await staffApi.update(accessToken, schoolId, staff.id, { status: nextStatus });
      setStaff(updated);
      show(nextStatus === "INACTIVE" ? "Staff member deactivated." : "Staff member reactivated.");
      setShowStatusConfirm(false);
    } catch (err) {
      show(err instanceof ApiError ? err.message : "Failed to update status", "danger");
    } finally {
      setTogglingStatus(false);
    }
  }

  async function onDelete() {
    if (!accessToken || !staff) return;
    setDeleting(true);
    try {
      await staffApi.remove(accessToken, schoolId, staff.id);
      show("Staff member deleted permanently.");
      router.push(`/schools/${schoolId}/staff`);
    } catch (err) {
      show(err instanceof ApiError ? err.message : "Failed to delete staff member", "danger");
      setShowDeleteConfirm(false);
    } finally {
      setDeleting(false);
    }
  }

  if (error) return <Alert tone="danger">{error}</Alert>;
  if (!staff || !accessToken) return <SkeletonCards count={3} />;

  const canUpdate = user?.permissions.includes("staff.update") ?? false;

  // Scoped to THIS school — same reasoning as StaffTable: a staff member
  // assigned here from another school may hold a different role/department
  // at each, so the header must never show their home-school title while
  // viewing them from a different school's admin pages.
  const assignmentHere = staff.assignments.find((a) => a.schoolId === schoolId);
  const roleHere = assignmentHere ? assignmentHere.role : staff.schoolId === schoolId ? staff.jobTitle : null;
  const departmentHere = assignmentHere ? assignmentHere.department?.name : staff.schoolId === schoolId ? staff.department?.name : null;
  const otherSchoolCount = new Set(staff.assignments.filter((a) => a.schoolId !== schoolId).map((a) => a.schoolId)).size;

  return (
    <div className="space-y-5">
      <Card>
        <div className="flex flex-wrap items-center gap-4">
          <Avatar name={`${staff.firstName} ${staff.lastName}`} size="lg" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-lg font-semibold text-foreground">
                {staff.firstName} {staff.lastName}
              </h1>
              <Badge tone={STATUS_TONE[staff.status]}>{staff.status.replace("_", " ")}</Badge>
            </div>
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-foreground-soft">
              {staff.staffCode && (
                <span className="font-mono text-xs font-medium text-accent" title="Permanent, organization-wide Staff ID">
                  {staff.staffCode}
                </span>
              )}
              <span className="font-mono text-xs text-foreground-muted" title="Staff number at this school">
                #{staff.staffNumber}
              </span>
              {roleHere && <span>{roleHere}</span>}
              {departmentHere && <span>{departmentHere}</span>}
              {staff.phone && (
                <span className="inline-flex items-center gap-1.5">
                  <Phone className="size-3.5" /> {staff.phone}
                </span>
              )}
              {staff.email && <span>{staff.email}</span>}
            </div>
            {otherSchoolCount > 0 && (
              <p className="mt-1 text-xs text-foreground-muted">
                Also works at {otherSchoolCount} other school{otherSchoolCount === 1 ? "" : "s"}.
              </p>
            )}
          </div>
          {canUpdate && !editing && (
            <div className="flex gap-2">
              <Button size="sm" variant="outline" icon={<Pencil className="size-4" />} onClick={() => setEditing(true)}>
                Edit profile
              </Button>
              <Button
                size="sm"
                variant={staff.status === "INACTIVE" ? "outline" : "danger"}
                icon={<Power className="size-4" />}
                onClick={() => setShowStatusConfirm(true)}
              >
                {staff.status === "INACTIVE" ? "Reactivate" : "Deactivate"}
              </Button>
              <Button size="sm" variant="danger" icon={<Trash2 className="size-4" />} onClick={() => setShowDeleteConfirm(true)}>
                Delete
              </Button>
            </div>
          )}
        </div>

        <ConfirmDialog
          open={showStatusConfirm}
          title={staff.status === "INACTIVE" ? `Reactivate ${staff.firstName}?` : `Deactivate ${staff.firstName}?`}
          description={
            staff.status === "INACTIVE"
              ? "This staff member will become active again."
              : "This staff member will be marked inactive. Their records and history are kept."
          }
          confirmLabel={staff.status === "INACTIVE" ? "Reactivate" : "Deactivate"}
          tone={staff.status === "INACTIVE" ? "primary" : "danger"}
          loading={togglingStatus}
          onConfirm={onToggleStatus}
          onCancel={() => setShowStatusConfirm(false)}
        />

        <ConfirmDialog
          open={showDeleteConfirm}
          title={`Delete ${staff.firstName} ${staff.lastName} permanently?`}
          description="This permanently deletes this staff member and their login account (if any). This action cannot be undone."
          confirmLabel="Delete permanently"
          loading={deleting}
          onConfirm={onDelete}
          onCancel={() => setShowDeleteConfirm(false)}
        />

        <div className="mt-4 grid grid-cols-2 gap-4 border-t border-border pt-4 sm:grid-cols-3 lg:grid-cols-4">
          <Field icon={User} label="Gender" value={staff.sex === "MALE" ? "Male" : staff.sex === "FEMALE" ? "Female" : "—"} />
          <Field icon={Cake} label="Date of birth" value={staff.dateOfBirth ? new Date(staff.dateOfBirth).toLocaleDateString() : "—"} />
          <Field icon={MapPin} label="Address" value={staff.address ?? "—"} />
          <Field label="Employment date" value={staff.employmentDate ? new Date(staff.employmentDate).toLocaleDateString() : "—"} />
          <Field
            icon={ShieldAlert}
            label="Emergency contact"
            value={
              staff.emergencyContactName || staff.emergencyContactPhone
                ? [staff.emergencyContactName, staff.emergencyContactPhone].filter(Boolean).join(" · ")
                : "—"
            }
          />
        </div>
      </Card>

      {editing && (
        <EditStaffForm
          accessToken={accessToken}
          schoolId={schoolId}
          staff={staff}
          onCancel={() => setEditing(false)}
          onSaved={(updated) => {
            setStaff(updated);
            setEditing(false);
          }}
        />
      )}
    </div>
  );
}

function Field({ icon: Icon, label, value }: { icon?: React.ComponentType<{ className?: string }>; label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-foreground-muted">{label}</p>
      <p className="mt-0.5 flex items-center gap-1.5 text-sm font-medium text-foreground">
        {Icon && <Icon className="size-3.5 text-foreground-muted" />}
        {value}
      </p>
    </div>
  );
}
