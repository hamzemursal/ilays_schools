"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Cake, MapPin, Pencil, Phone, Power, Send, ShieldAlert, Trash2, User } from "lucide-react";
import { ApiError, useAuth } from "@/lib/auth-context";
import type { Teacher } from "@/lib/api";
import { teachersApi } from "../api";
import { PhotoUpload } from "../components/PhotoUpload";
import { DocumentsCard } from "../components/DocumentsCard";
import { EditTeacherForm } from "./EditTeacherForm";
import { AssignmentsManager } from "./AssignmentsManager";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { Input } from "@/components/ui/FormControls";
import { SkeletonCards } from "@/components/ui/Skeleton";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useToast } from "@/components/ui/Toast";

const STATUS_TONE: Record<Teacher["status"], "success" | "warning" | "neutral"> = {
  ACTIVE: "success",
  ON_LEAVE: "warning",
  INACTIVE: "neutral",
};

export function TeacherProfile({ schoolId, teacherId }: { schoolId: string; teacherId: string }) {
  const { user, accessToken } = useAuth();
  const { show } = useToast();
  const router = useRouter();

  const [teacher, setTeacher] = useState<Teacher | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteResult, setInviteResult] = useState<{ email: string; acceptUrl: string } | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [showStatusConfirm, setShowStatusConfirm] = useState(false);
  const [togglingStatus, setTogglingStatus] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!accessToken) return;
    teachersApi
      .getOne(accessToken, schoolId, teacherId)
      .then(setTeacher)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load teacher"));
    teachersApi
      .getPhotoUrl(accessToken, schoolId, teacherId)
      .then((res) => setPhotoUrl(res.url))
      .catch(() => setPhotoUrl(null));
  }, [accessToken, schoolId, teacherId]);

  async function onInvite() {
    if (!accessToken || !teacher) return;
    setInviting(true);
    setInviteError(null);
    setInviteResult(null);
    try {
      const result = await teachersApi.inviteLogin(
        accessToken,
        schoolId,
        teacher.id,
        teacher.email ? undefined : inviteEmail,
      );
      setInviteResult(result);
      show(`Invitation created for ${result.email}.`);
    } catch (err) {
      setInviteError(err instanceof ApiError ? err.message : "Failed to send invite");
    } finally {
      setInviting(false);
    }
  }

  async function onToggleStatus() {
    if (!accessToken || !teacher) return;
    setTogglingStatus(true);
    try {
      const nextStatus = teacher.status === "INACTIVE" ? "ACTIVE" : "INACTIVE";
      const updated = await teachersApi.update(accessToken, schoolId, teacher.id, { status: nextStatus });
      setTeacher(updated);
      show(nextStatus === "INACTIVE" ? "Teacher deactivated." : "Teacher reactivated.");
      setShowStatusConfirm(false);
    } catch (err) {
      show(err instanceof ApiError ? err.message : "Failed to update teacher status", "danger");
    } finally {
      setTogglingStatus(false);
    }
  }

  async function onDelete() {
    if (!accessToken || !teacher) return;
    setDeleting(true);
    try {
      await teachersApi.remove(accessToken, schoolId, teacher.id);
      show("Teacher deleted permanently.");
      router.push(`/schools/${schoolId}/teachers`);
    } catch (err) {
      show(err instanceof ApiError ? err.message : "Failed to delete teacher", "danger");
      setShowDeleteConfirm(false);
    } finally {
      setDeleting(false);
    }
  }

  if (error) return <Alert tone="danger">{error}</Alert>;
  if (!teacher || !accessToken) return <SkeletonCards count={3} />;

  const canUpdate = user?.permissions.includes("teachers.update") ?? false;

  return (
    <div className="space-y-5">
      <Card>
        <div className="flex flex-wrap items-center gap-4">
          <PhotoUpload
            accessToken={accessToken}
            schoolId={schoolId}
            teacherId={teacher.id}
            name={`${teacher.firstName} ${teacher.lastName}`}
            canUpload={canUpdate}
            size="lg"
            photoUrl={photoUrl}
            onUploaded={setPhotoUrl}
          />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-lg font-semibold text-foreground">
                {teacher.firstName} {teacher.lastName}
              </h1>
              <Badge tone={STATUS_TONE[teacher.status]}>{teacher.status.replace("_", " ")}</Badge>
              {teacher.userId && <Badge tone="accent">Has login</Badge>}
            </div>
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-foreground-soft">
              <span className="font-mono text-xs text-foreground-muted">#{teacher.employeeNumber}</span>
              {teacher.phone && (
                <span className="inline-flex items-center gap-1.5">
                  <Phone className="size-3.5" /> {teacher.phone}
                </span>
              )}
              {teacher.email && <span className="inline-flex items-center gap-1.5">{teacher.email}</span>}
            </div>
          </div>
          {canUpdate && !editing && (
            <div className="flex gap-2">
              <Button size="sm" variant="outline" icon={<Pencil className="size-4" />} onClick={() => setEditing(true)}>
                Edit profile
              </Button>
              <Button
                size="sm"
                variant={teacher.status === "INACTIVE" ? "outline" : "danger"}
                icon={<Power className="size-4" />}
                onClick={() => setShowStatusConfirm(true)}
              >
                {teacher.status === "INACTIVE" ? "Reactivate" : "Deactivate"}
              </Button>
              <Button
                size="sm"
                variant="danger"
                icon={<Trash2 className="size-4" />}
                onClick={() => setShowDeleteConfirm(true)}
              >
                Delete
              </Button>
            </div>
          )}
        </div>

        <ConfirmDialog
          open={showStatusConfirm}
          title={teacher.status === "INACTIVE" ? `Reactivate ${teacher.firstName}?` : `Deactivate ${teacher.firstName}?`}
          description={
            teacher.status === "INACTIVE"
              ? "This teacher will become active again and regain access to their portal."
              : "This teacher will lose access to their portal. Their records, assignments, and history are kept."
          }
          confirmLabel={teacher.status === "INACTIVE" ? "Reactivate" : "Deactivate"}
          tone={teacher.status === "INACTIVE" ? "primary" : "danger"}
          loading={togglingStatus}
          onConfirm={onToggleStatus}
          onCancel={() => setShowStatusConfirm(false)}
        />

        <ConfirmDialog
          open={showDeleteConfirm}
          title={`Delete ${teacher.firstName} ${teacher.lastName} permanently?`}
          description="This permanently deletes this teacher and every related record — class/subject assignments, their login account (if any), and uploaded photos/documents. This action cannot be undone."
          confirmLabel="Delete permanently"
          loading={deleting}
          onConfirm={onDelete}
          onCancel={() => setShowDeleteConfirm(false)}
        />

        <div className="mt-4 grid grid-cols-2 gap-4 border-t border-border pt-4 sm:grid-cols-3 lg:grid-cols-4">
          <Field icon={User} label="Gender" value={teacher.sex === "MALE" ? "Male" : teacher.sex === "FEMALE" ? "Female" : "—"} />
          <Field icon={Cake} label="Date of birth" value={teacher.dateOfBirth ? new Date(teacher.dateOfBirth).toLocaleDateString() : "—"} />
          <Field icon={MapPin} label="Address" value={teacher.address ?? "—"} />
          <Field label="Qualification" value={teacher.qualification ?? "—"} />
          <Field label="Specialization" value={teacher.specialization ?? "—"} />
          <Field label="Employment date" value={teacher.employmentDate ? new Date(teacher.employmentDate).toLocaleDateString() : "—"} />
          <Field
            icon={ShieldAlert}
            label="Emergency contact"
            value={
              teacher.emergencyContactName || teacher.emergencyContactPhone
                ? [teacher.emergencyContactName, teacher.emergencyContactPhone].filter(Boolean).join(" · ")
                : "—"
            }
          />
        </div>

        {canUpdate && !teacher.userId && !editing && (
          <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border pt-4">
            {!teacher.email && (
              <Input
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="Email for login invite"
                className="w-56"
              />
            )}
            <Button
              size="sm"
              variant="outline"
              icon={<Send className="size-4" />}
              loading={inviting}
              disabled={!teacher.email && !inviteEmail}
              onClick={onInvite}
            >
              Invite to log in
            </Button>
          </div>
        )}
        {inviteError && (
          <Alert tone="danger" className="mt-3">
            {inviteError}
          </Alert>
        )}
        {inviteResult && (
          <Alert tone="success" className="mt-3">
            <p className="font-medium">Invitation created for {inviteResult.email}.</p>
            <p className="mt-1 break-all font-mono text-xs">{inviteResult.acceptUrl}</p>
            <p className="mt-1 text-foreground-soft">
              Email delivery isn&apos;t wired up yet — share this link with them directly for now.
            </p>
          </Alert>
        )}
      </Card>

      {editing && (
        <EditTeacherForm
          accessToken={accessToken}
          schoolId={schoolId}
          teacher={teacher}
          onCancel={() => setEditing(false)}
          onSaved={(updated) => {
            setTeacher(updated);
            setEditing(false);
          }}
        />
      )}

      <AssignmentsManager
        accessToken={accessToken}
        schoolId={schoolId}
        teacher={teacher}
        canManage={canUpdate}
        onChange={setTeacher}
      />

      <DocumentsCard
        canUpload={canUpdate}
        list={() => teachersApi.listDocuments(accessToken, schoolId, teacherId)}
        upload={(file, label) => teachersApi.uploadDocument(accessToken, schoolId, teacherId, file, label)}
      />
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
