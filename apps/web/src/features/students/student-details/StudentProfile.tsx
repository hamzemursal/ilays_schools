"use client";

import { useEffect, useState, type FormEvent } from "react";
import { ArrowLeftRight, Cake, Plus, User } from "lucide-react";
import { useAuth, ApiError } from "@/lib/auth-context";
import { api, type GuardianRecord, type StudentDetail } from "@/lib/api";
import { studentsApi } from "../api";
import { PhotoUpload } from "../components/PhotoUpload";
import { Card, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { EmptyState } from "@/components/ui/EmptyState";
import { SkeletonCards } from "@/components/ui/Skeleton";
import { FormField, Select, Textarea } from "@/components/ui/FormControls";
import { GuardianCard } from "@/features/guardians/components/GuardianCard";
import { GuardianForm } from "@/features/guardians/forms/GuardianForm";
import { useToast } from "@/components/ui/Toast";

const STATUS_TONE: Record<StudentDetail["currentStatus"], "success" | "accent" | "neutral" | "warning"> = {
  ACTIVE: "success",
  COMPLETED: "accent",
  GRADUATED: "accent",
  TRANSFERRED: "warning",
  WITHDRAWN: "neutral",
  ARCHIVED: "neutral",
};

export function StudentProfile({ studentId }: { studentId: string }) {
  const { user, accessToken } = useAuth();
  const { show } = useToast();

  const [student, setStudent] = useState<StudentDetail | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [addingGuardian, setAddingGuardian] = useState(false);

  useEffect(() => {
    if (!accessToken) return;
    studentsApi
      .getOne(accessToken, studentId)
      .then(setStudent)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load student"));
    studentsApi
      .getPhotoUrl(accessToken, studentId)
      .then((res) => setPhotoUrl(res.url))
      .catch(() => setPhotoUrl(null));
  }, [accessToken, studentId]);

  if (error) return <Alert tone="danger">{error}</Alert>;
  if (!student) return <SkeletonCards count={3} />;

  const activeEnrollment = student.enrollments.find((e) => e.status === "ACTIVE");
  const canUpdate = user?.permissions.includes("students.update") ?? false;
  const canManageGuardians = user?.permissions.includes("guardians.manage") ?? false;
  const canTransfer = (user?.permissions.includes("transfers.create") ?? false) && !!activeEnrollment;

  return (
    <div className="space-y-5">
      <Card>
        <div className="flex flex-wrap items-center gap-4">
          {accessToken && (
            <PhotoUpload
              accessToken={accessToken}
              studentId={student.id}
              name={`${student.firstName} ${student.lastName}`}
              canUpload={canUpdate}
              size="lg"
              photoUrl={photoUrl}
              onUploaded={setPhotoUrl}
            />
          )}
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-lg font-semibold text-foreground">
                {student.firstName} {student.lastName}
              </h1>
              <Badge tone={STATUS_TONE[student.currentStatus]}>{student.currentStatus}</Badge>
            </div>
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-foreground-soft">
              <span className="inline-flex items-center gap-1.5">
                <Cake className="size-3.5" /> {new Date(student.dateOfBirth).toLocaleDateString()}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <User className="size-3.5" /> {student.sex === "MALE" ? "Male" : "Female"}
              </span>
              {activeEnrollment && (
                <span className="font-mono text-xs text-foreground-muted">#{activeEnrollment.studentNumber}</span>
              )}
            </div>
          </div>
        </div>
      </Card>

      {activeEnrollment && (
        <Card>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-foreground-muted">Current enrollment</h2>
          <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Field label="School" value={activeEnrollment.school.name} />
            <Field label="Class" value={activeEnrollment.class.name} />
            <Field label="Section" value={activeEnrollment.section.name} />
            <Field label="Roll #" value={String(activeEnrollment.rollNumber)} />
          </div>
        </Card>
      )}

      <Card padding="none">
        <CardHeader title="Enrollment history" />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="bg-surface-soft text-xs font-semibold uppercase tracking-wide text-foreground-muted">
              <tr>
                <th className="px-5 py-2.5">School</th>
                <th className="px-5 py-2.5">Year</th>
                <th className="px-5 py-2.5">Class / Section</th>
                <th className="px-5 py-2.5">Roll #</th>
                <th className="px-5 py-2.5">Status</th>
                <th className="px-5 py-2.5">Dates</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {student.enrollments.map((e) => (
                <tr key={e.id}>
                  <td className="px-5 py-3 text-foreground">{e.school.name}</td>
                  <td className="px-5 py-3 text-foreground-soft">{e.academicYear.name}</td>
                  <td className="px-5 py-3 text-foreground-soft">
                    {e.class.name} · {e.section.name}
                  </td>
                  <td className="px-5 py-3 text-foreground-soft">{e.rollNumber}</td>
                  <td className="px-5 py-3">
                    <Badge tone={e.status === "ACTIVE" ? "success" : "neutral"}>{e.status.replace("_", " ")}</Badge>
                  </td>
                  <td className="px-5 py-3 text-foreground-soft">
                    {new Date(e.startDate).toLocaleDateString()}
                    {e.endDate ? ` – ${new Date(e.endDate).toLocaleDateString()}` : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card padding="none">
        <CardHeader
          title="Parent / guardian"
          actions={
            canManageGuardians &&
            !addingGuardian && (
              <Button size="sm" variant="outline" icon={<Plus className="size-4" />} onClick={() => setAddingGuardian(true)}>
                Add guardian
              </Button>
            )
          }
        />
        <div className="space-y-3 p-5">
          {addingGuardian && accessToken && (
            <GuardianForm
              accessToken={accessToken}
              studentId={student.id}
              onCancel={() => setAddingGuardian(false)}
              onAdded={(guardian: GuardianRecord) => {
                setStudent((prev) => (prev ? { ...prev, guardians: [...prev.guardians, guardian] } : prev));
                setAddingGuardian(false);
                show("Guardian added.");
              }}
            />
          )}
          {student.guardians.length === 0 && !addingGuardian ? (
            <EmptyState icon={User} title="No guardians on file" description="Add a parent or guardian for this student." />
          ) : (
            student.guardians.map((g) => <GuardianCard key={g.id} guardian={g} />)
          )}
        </div>
      </Card>

      {canTransfer && activeEnrollment && accessToken && (
        <TransferRequestCard accessToken={accessToken} studentId={student.id} fromSchoolName={activeEnrollment.school.name} />
      )}
    </div>
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

function TransferRequestCard({
  accessToken,
  studentId,
  fromSchoolName,
}: {
  accessToken: string;
  studentId: string;
  fromSchoolName: string;
}) {
  const { show } = useToast();
  const [open, setOpen] = useState(false);
  const [schools, setSchools] = useState<{ id: string; name: string }[]>([]);
  const [toSchoolId, setToSchoolId] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    if (!open) return;
    api
      .listSchoolDirectory(accessToken)
      .then((list) => {
        const filtered = list.filter((s) => s.name !== fromSchoolName);
        setSchools(filtered);
        if (filtered[0]) setToSchoolId(filtered[0].id);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load schools"));
  }, [open, accessToken, fromSchoolName]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await api.requestTransfer(accessToken, studentId, { toSchoolId, reason: reason || undefined });
      setSent(true);
      show("Transfer requested.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to request transfer");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card padding="none">
      <CardHeader
        title="Transfer"
        description="Move this student to another school in the organization."
        actions={
          !open &&
          !sent && (
            <Button size="sm" variant="outline" icon={<ArrowLeftRight className="size-4" />} onClick={() => setOpen(true)}>
              Request transfer
            </Button>
          )
        }
      />
      {sent ? (
        <div className="p-5">
          <Alert tone="success">Transfer requested — the destination school&apos;s admin needs to approve it.</Alert>
        </div>
      ) : open ? (
        <form onSubmit={onSubmit} className="space-y-4 p-5">
          <FormField label="Destination school" required>
            <Select required value={toSchoolId} onChange={(e) => setToSchoolId(e.target.value)}>
              {schools.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Reason (optional)">
            <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
          </FormField>
          {error && <Alert tone="danger">{error}</Alert>}
          <div className="flex gap-2">
            <Button type="submit" size="sm" loading={submitting} disabled={!toSchoolId}>
              Send request
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </div>
        </form>
      ) : null}
    </Card>
  );
}
