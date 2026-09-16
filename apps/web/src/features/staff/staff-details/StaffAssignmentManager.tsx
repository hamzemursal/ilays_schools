"use client";

import { useEffect, useState } from "react";
import { Pencil, Power } from "lucide-react";
import { api, type Department, type Staff } from "@/lib/api";
import { ApiError } from "@/lib/auth-context";
import { staffApi } from "../api";
import { Card, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { FormField, Input, Select } from "@/components/ui/FormControls";

// Unlike Teacher (many class/section/subject assignments per school), a
// Staff member has at most one StaffAssignment per school — the
// [staffId, schoolId] unique constraint — so this manages one record, not
// a list. Reuses the same assignToSchool upsert AssignExistingStaffForm
// calls: saving here either creates the first explicit assignment row for
// this school (formalizing what was previously just the fallback home-
// school department/jobTitle) or updates the existing one. No duplicate
// business logic.
export function StaffAssignmentManager({
  accessToken,
  schoolId,
  staff,
  canManage,
  onChange,
}: {
  accessToken: string;
  schoolId: string;
  staff: Staff;
  canManage: boolean;
  onChange: (staff: Staff) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [departmentId, setDepartmentId] = useState("");
  const [role, setRole] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showToggleConfirm, setShowToggleConfirm] = useState(false);
  const [toggling, setToggling] = useState(false);

  const assignment = staff.assignments.find((a) => a.schoolId === schoolId);
  const isHomeSchool = staff.schoolId === schoolId;
  // Before any explicit StaffAssignment row exists here, the home school's
  // own department/jobTitle stand in for it — same fallback StaffTable and
  // the profile header already use, so this card never contradicts them.
  const currentDepartmentName = assignment ? (assignment.department?.name ?? null) : isHomeSchool ? (staff.department?.name ?? null) : null;
  const currentRole = assignment ? assignment.role : isHomeSchool ? staff.jobTitle : null;
  const isActiveHere = assignment ? assignment.status === "ACTIVE" : isHomeSchool && staff.status !== "INACTIVE";

  useEffect(() => {
    if (!editing) return;
    api.listDepartments(accessToken, schoolId).then(setDepartments);
    setDepartmentId(assignment?.departmentId ?? (isHomeSchool ? (staff.departmentId ?? "") : ""));
    setRole(currentRole ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing, accessToken, schoolId]);

  async function onSave() {
    setSaving(true);
    setError(null);
    try {
      await staffApi.assignToSchool(accessToken, schoolId, staff.id, {
        departmentId: departmentId || undefined,
        role: role.trim() || undefined,
      });
      const updated = await staffApi.getOne(accessToken, schoolId, staff.id);
      onChange(updated);
      setEditing(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to save this assignment");
    } finally {
      setSaving(false);
    }
  }

  // Only reachable once an explicit assignment row exists (see below) —
  // deactivating a home school with no row yet has nothing to toggle;
  // that's what the profile's own top-level Deactivate button (Staff.status)
  // is for.
  async function onToggleActive() {
    if (!assignment) return;
    setToggling(true);
    try {
      if (assignment.status === "ACTIVE") {
        await staffApi.deactivateAssignment(accessToken, schoolId, staff.id, assignment.id);
      } else {
        await staffApi.assignToSchool(accessToken, schoolId, staff.id, {
          departmentId: assignment.departmentId ?? undefined,
          role: assignment.role ?? undefined,
        });
      }
      const updated = await staffApi.getOne(accessToken, schoolId, staff.id);
      onChange(updated);
      setShowToggleConfirm(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to update status");
    } finally {
      setToggling(false);
    }
  }

  return (
    <Card padding="none">
      <CardHeader
        title="Assignment at this school"
        description="Department, role, and status specific to this school — separate from their overall staff status."
        actions={
          canManage &&
          (editing ? (
            <Button size="sm" variant="outline" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          ) : (
            <Button size="sm" variant="outline" icon={<Pencil className="size-4" />} onClick={() => setEditing(true)}>
              Edit
            </Button>
          ))
        }
      />
      <div className="space-y-3 p-5">
        {editing ? (
          <>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <FormField label="Department">
                <Select value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}>
                  <option value="">No department</option>
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </Select>
              </FormField>
              <FormField label="Role at this school">
                <Input value={role} onChange={(e) => setRole(e.target.value)} placeholder="e.g. Librarian" />
              </FormField>
            </div>
            {error && <Alert tone="danger">{error}</Alert>}
            <Button size="sm" loading={saving} onClick={onSave}>
              Save
            </Button>
          </>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <Field label="Department" value={currentDepartmentName ?? "—"} />
              <Field label="Role" value={currentRole ?? "—"} />
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-foreground-muted">Status here</p>
                <Badge tone={isActiveHere ? "success" : "neutral"} className="mt-0.5">
                  {isActiveHere ? "Active" : "Inactive"}
                </Badge>
              </div>
            </div>
            {error && <Alert tone="danger">{error}</Alert>}
            {canManage && assignment && (
              <Button
                size="sm"
                variant={assignment.status === "ACTIVE" ? "danger" : "outline"}
                icon={<Power className="size-4" />}
                onClick={() => setShowToggleConfirm(true)}
              >
                {assignment.status === "ACTIVE" ? "Deactivate here" : "Reactivate here"}
              </Button>
            )}
          </>
        )}
      </div>

      <ConfirmDialog
        open={showToggleConfirm}
        title={
          assignment?.status === "ACTIVE"
            ? `Deactivate ${staff.firstName} at this school?`
            : `Reactivate ${staff.firstName} at this school?`
        }
        description={
          assignment?.status === "ACTIVE"
            ? "This only affects their assignment at this school — their standing at any other school they work at is unaffected, and this assignment's history is kept."
            : "This staff member will become active at this school again."
        }
        confirmLabel={assignment?.status === "ACTIVE" ? "Deactivate here" : "Reactivate here"}
        tone={assignment?.status === "ACTIVE" ? "danger" : "primary"}
        loading={toggling}
        onConfirm={onToggleActive}
        onCancel={() => setShowToggleConfirm(false)}
      />
    </Card>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-foreground-muted">{label}</p>
      <p className="mt-0.5 text-sm font-medium text-foreground">{value}</p>
    </div>
  );
}
