"use client";

import { use, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth, ApiError } from "@/lib/auth-context";
import { api, type GuardianRelationship, type ParentDetail, type StudentListItem } from "@/lib/api";
import { parentsApi } from "@/features/parents/api";
import { ResetPortalPasswordCard } from "@/features/portal-accounts/ResetPortalPasswordCard";
import { RELATIONSHIPS, RelationshipBadge, relationshipLabel } from "@/features/guardians/relationships";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { EmptyState } from "@/components/ui/EmptyState";
import { FormField, Input, Select } from "@/components/ui/FormControls";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { SkeletonCards } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import { Eye, GraduationCap, Mail, MapPin, Pencil, Phone, Plus, Send, Trash2, UserSquare2, Users, X } from "lucide-react";
import { StudentAccessBadge } from "@/features/parents/StudentAccessBadge";
import { Avatar } from "@/components/ui/Avatar";


const PORTAL_TONE: Record<string, "success" | "warning" | "neutral"> = {
  ACTIVE: "success",
  PENDING_SETUP: "warning",
  SUSPENDED: "neutral",
};

export default function ParentProfilePage({
  params,
}: {
  params: Promise<{ id: string; guardianId: string }>;
}) {
  const { id: schoolId, guardianId } = use(params);
  const { user, accessToken } = useAuth();
  const { show } = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [parent, setParent] = useState<ParentDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(searchParams.get("edit") === "1");
  const [addingChild, setAddingChild] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<{ studentId: string; name: string } | null>(null);
  const [removing, setRemoving] = useState(false);
  const [invite, setInvite] = useState<{ email: string; acceptUrl: string } | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviting, setInviting] = useState(false);

  function load() {
    if (!accessToken) return;
    parentsApi
      .getOne(accessToken, schoolId, guardianId)
      .then(setParent)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load parent"));
  }

  useEffect(load, [accessToken, schoolId, guardianId]);

  const canManage = user?.permissions.includes("guardians.manage") ?? false;
  const schoolName = user?.schools.find((s) => s.id === schoolId)?.name ?? "School";

  async function onInvite() {
    if (!accessToken) return;
    setInviting(true);
    setInviteError(null);
    try {
      const result = await parentsApi.createPortalAccount(accessToken, schoolId, guardianId, parent?.email || undefined);
      setInvite(result);
      show(`Invitation created for ${result.email}.`);
    } catch (err) {
      setInviteError(err instanceof ApiError ? err.message : "Failed to create portal account");
    } finally {
      setInviting(false);
    }
  }

  async function onDelete() {
    if (!accessToken) return;
    setDeleting(true);
    try {
      await parentsApi.remove(accessToken, schoolId, guardianId);
      show("Parent deleted permanently.");
      router.push(`/schools/${schoolId}/parents`);
    } catch (err) {
      show(err instanceof ApiError ? err.message : "Failed to delete parent", "danger");
      setShowDeleteConfirm(false);
    } finally {
      setDeleting(false);
    }
  }

  async function onRemoveChild() {
    if (!accessToken || !removeTarget) return;
    setRemoving(true);
    try {
      await parentsApi.removeChild(accessToken, schoolId, guardianId, removeTarget.studentId);
      show(`Removed relationship with ${removeTarget.name}.`);
      setRemoveTarget(null);
      load();
    } catch (err) {
      show(err instanceof ApiError ? err.message : "Failed to remove relationship", "danger");
    } finally {
      setRemoving(false);
    }
  }

  if (error) {
    return (
      <div className="p-4 sm:p-6">
        <Alert tone="danger">{error}</Alert>
      </div>
    );
  }

  if (!parent) {
    return (
      <div className="p-4 sm:p-6">
        <SkeletonCards count={3} />
      </div>
    );
  }

  const activeChildren = parent.students.filter((s) => s.status === "ACTIVE");
  // Split by enrollment, not only by link: a still-linked child whose
  // enrollments have all closed (graduated, completed, transferred) is a
  // former student — shown apart, as history, never as a current child.
  const currentChildren = activeChildren.filter((s) => s.student.enrollments.some((e) => e.status === "ACTIVE"));
  const formerChildren = activeChildren.filter((s) => !s.student.enrollments.some((e) => e.status === "ACTIVE"));
  const inactiveChildren = parent.students.filter((s) => s.status === "INACTIVE");

  return (
    <div>
      <PageHeader
        variant="plain"
        eyebrow="Parents"
        title={`${parent.firstName} ${parent.lastName}`}
        description={schoolName}
        breadcrumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Parents", href: `/schools/${schoolId}/parents` },
          { label: "Profile" },
        ]}
        actions={
          canManage && (
            <>
              {!editing && (
                <Button variant="outline" size="sm" icon={<Pencil className="size-4" />} onClick={() => setEditing(true)}>
                  Edit Parent
                </Button>
              )}
              <Button
                variant="danger"
                size="sm"
                icon={<Trash2 className="size-4" />}
                onClick={() => setShowDeleteConfirm(true)}
              >
                Delete
              </Button>
            </>
          )
        }
      />

      <ConfirmDialog
        open={showDeleteConfirm}
        title={`Delete ${parent.firstName} ${parent.lastName} permanently?`}
        description="This permanently deletes this parent and every related record — relationships to their children, notifications, and their portal login account (if any). This action cannot be undone."
        confirmLabel="Delete permanently"
        loading={deleting}
        onConfirm={onDelete}
        onCancel={() => setShowDeleteConfirm(false)}
      />

      <ConfirmDialog
        open={!!removeTarget}
        title={`Remove relationship with ${removeTarget?.name ?? ""}?`}
        description="This unlinks the parent from this student. The relationship history is kept, not deleted."
        confirmLabel="Remove"
        loading={removing}
        onConfirm={onRemoveChild}
        onCancel={() => setRemoveTarget(null)}
      />

      <div className="space-y-5 px-3 pb-8 pt-4 sm:px-5">
        {/* Identity: initials, parent ID, status and the ways to reach them. */}
        <section aria-label="Parent summary" className="rounded-2xl border border-border bg-background p-5 shadow-sm">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center">
            <div className="flex min-w-0 flex-1 items-center gap-4">
              <Avatar name={`${parent.firstName} ${parent.lastName}`} size="lg" />
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  {parent.guardianCode && (
                    <span className="rounded-md bg-accent-soft px-2 py-0.5 font-mono text-xs font-semibold text-accent">{parent.guardianCode}</span>
                  )}
                  <Badge tone={parent.status === "ACTIVE" ? "success" : "neutral"}>{parent.status}</Badge>
                  {parent.user ? (
                    <Badge tone={PORTAL_TONE[parent.user.status] ?? "neutral"}>Portal: {parent.user.status.replace("_", " ")}</Badge>
                  ) : (
                    <Badge tone="neutral">No portal account</Badge>
                  )}
                  <StudentAccessBadge access={parent.studentAccess} />
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {parent.phone && (
                    <a
                      href={`tel:${parent.phone}`}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1 text-sm text-foreground-soft transition-colors hover:border-accent/40 hover:text-accent"
                    >
                      <Phone className="size-3.5" /> Call
                    </a>
                  )}
                  {parent.email && (
                    <a
                      href={`mailto:${parent.email}`}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1 text-sm text-foreground-soft transition-colors hover:border-accent/40 hover:text-accent"
                    >
                      <Mail className="size-3.5" /> Email
                    </a>
                  )}
                </div>
              </div>
            </div>
            <dl className="grid grid-cols-2 gap-3 sm:w-auto lg:w-[340px]">
              <SummaryStat icon={Users} tone="bg-emerald-50 text-emerald-600" label="Active children" value={currentChildren.length} />
              <SummaryStat icon={GraduationCap} tone="bg-amber-50 text-amber-600" label="Former children" value={formerChildren.length} />
            </dl>
          </div>
        </section>

        {editing ? (
          <EditParentForm
            accessToken={accessToken!}
            schoolId={schoolId}
            guardianId={guardianId}
            parent={parent}
            onCancel={() => setEditing(false)}
            onSaved={() => {
              setEditing(false);
              load();
            }}
          />
        ) : (
          <Card padding="none" className="rounded-2xl">
            <CardHeader title="Profile information" />
            <div className="grid grid-cols-1 gap-3 p-5 sm:grid-cols-3">
              <Field icon={Phone} tone="bg-accent-soft text-accent" label="Phone" value={parent.phone ?? "—"} />
              <Field icon={Mail} tone="bg-teal-50 text-teal-600" label="Email" value={parent.email ?? "—"} />
              <Field icon={MapPin} tone="bg-rose-50 text-rose-600" label="Address" value={parent.address ?? "—"} />
            </div>
          </Card>
        )}

        <Card padding="none" className="rounded-2xl">
          <CardHeader
            title="Active Children"
            description="Students this parent is linked to who are currently enrolled."
            actions={
              canManage &&
              !addingChild && (
                <Button size="sm" variant="outline" icon={<Plus className="size-4" />} onClick={() => setAddingChild(true)}>
                  Add Child
                </Button>
              )
            }
          />
          <div className="space-y-3 p-5">
            {addingChild && accessToken && (
              <AddChildForm
                accessToken={accessToken}
                schoolId={schoolId}
                guardianId={guardianId}
                existingStudentIds={parent.students.filter((s) => s.status === "ACTIVE").map((s) => s.studentId)}
                onCancel={() => setAddingChild(false)}
                onAdded={() => {
                  setAddingChild(false);
                  load();
                }}
              />
            )}

            {currentChildren.length === 0 && !addingChild ? (
              <EmptyState
                icon={UserSquare2}
                title={formerChildren.length > 0 ? "No currently enrolled children" : "No children linked yet"}
                description={formerChildren.length > 0 ? "Every linked child is a former student — see Former Children below." : "Use Add Child to link a student."}
              />
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {currentChildren.map((s, i) => {
                  const enrollment = s.student.enrollments.find((e) => e.status === "ACTIVE") ?? s.student.enrollments[0];
                  const tone = CHILD_TONES[i % CHILD_TONES.length];
                  const childName = `${s.student.firstName} ${s.student.lastName}`;
                  return (
                    <div
                      key={s.studentId}
                      className="relative flex flex-col overflow-hidden rounded-2xl border border-border bg-background p-4 pl-5 shadow-sm transition-shadow hover:shadow-md"
                    >
                      <span className={`absolute inset-y-0 left-0 w-1.5 ${tone.bar}`} aria-hidden />
                      <div className="flex items-start gap-3">
                        <span className={`flex size-11 shrink-0 items-center justify-center rounded-xl text-sm font-bold ${tone.soft} ${tone.text}`} aria-hidden>
                          {initials(childName)}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-semibold text-foreground">{childName}</p>
                          {enrollment ? (
                            <p className="mt-0.5 flex items-center gap-1.5 text-sm text-foreground-soft">
                              <GraduationCap className="size-3.5 text-foreground-muted" />
                              {enrollment.class.name} · {enrollment.section.name}
                            </p>
                          ) : (
                            <p className="mt-0.5 text-sm text-foreground-muted">Not currently enrolled</p>
                          )}
                          {enrollment && <p className="text-xs text-foreground-muted">{enrollment.academicYear.name}</p>}
                        </div>
                      </div>
                      <div className="mt-3 flex flex-wrap items-center gap-1.5">
                        <RelationshipBadge relationship={s.relationship} />
                        {s.isPrimaryContact && <Badge tone="success">Primary</Badge>}
                      </div>
                      <div className="mt-4 flex gap-2 border-t border-border pt-3">
                        <Link href={`/schools/${schoolId}/students/${s.studentId}`} className="flex-1">
                          <Button size="sm" variant="secondary" className="w-full" icon={<Eye className="size-4" />}>
                            View Student
                          </Button>
                        </Link>
                        {canManage && (
                          <Button
                            size="sm"
                            variant="ghost"
                            icon={<X className="size-4" />}
                            aria-label={`Remove relationship with ${s.student.firstName}`}
                            onClick={() => setRemoveTarget({ studentId: s.studentId, name: childName })}
                          />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </Card>

        {formerChildren.length > 0 && (
          <Card padding="none" className="rounded-2xl">
            <CardHeader
              title="Former Children"
              description="Graduated, completed or transferred — their history stays viewable; they are not current students."
            />
            <div className="grid grid-cols-1 gap-3 p-5 sm:grid-cols-2 xl:grid-cols-3">
              {formerChildren.map((s) => {
                const last = s.student.enrollments[0];
                const childName = `${s.student.firstName} ${s.student.lastName}`;
                return (
                  <div key={s.studentId} className="flex flex-col rounded-2xl border border-dashed border-border bg-surface-soft/50 p-4">
                    <div className="flex items-start gap-3">
                      <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-sm font-bold text-amber-700" aria-hidden>
                        {initials(childName)}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold text-foreground">{childName}</p>
                        {last && (
                          <p className="mt-0.5 text-sm text-foreground-soft">
                            Last: {last.class.name} · {last.section.name} · {last.academicYear.name}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-1.5">
                      <Badge tone="warning">{last ? FORMER_LABEL[last.status] ?? "Former student" : "Former student"}</Badge>
                      <RelationshipBadge relationship={s.relationship} />
                    </div>
                    <div className="mt-4 border-t border-border pt-3">
                      <Link href={`/schools/${schoolId}/students/${s.studentId}`}>
                        <Button size="sm" variant="secondary" className="w-full" icon={<Eye className="size-4" />}>
                          View history
                        </Button>
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        )}

        {canManage && !parent.user && (
          <Card padding="none" className="rounded-2xl">
            <CardHeader title="Portal account" description="Give this parent secure access to the Parent Portal." />
            <div className="p-5">
              {invite ? (
                <Alert tone="success">
                  <p className="font-medium">Invitation created for {invite.email}.</p>
                  <p className="mt-1 break-all font-mono text-xs">{invite.acceptUrl}</p>
                  <p className="mt-1 text-foreground-soft">
                    Email delivery isn&apos;t wired up yet — share this link with them directly for now.
                  </p>
                </Alert>
              ) : (
                <Button size="sm" icon={<Send className="size-4" />} loading={inviting} onClick={onInvite}>
                  Create Portal Account
                </Button>
              )}
              {inviteError && (
                <Alert tone="danger" className="mt-3">
                  {inviteError}
                </Alert>
              )}
            </div>
          </Card>
        )}

        {canManage && parent.user && (
          <ResetPortalPasswordCard
            personName={`${parent.firstName} ${parent.lastName}`}
            onReset={async () => {
              const r = await parentsApi.resetPortalPassword(accessToken!, schoolId, guardianId);
              return { loginLabel: "Login email", loginValue: r.email, temporaryPassword: r.temporaryPassword };
            }}
          />
        )}

        {inactiveChildren.length > 0 && (
          <Card padding="none" className="rounded-2xl">
            <CardHeader title="Relationships" description="Includes relationships that have since been removed." />
            <div className="divide-y divide-border">
              {parent.students.map((s) => (
                <div key={s.studentId} className="flex items-center justify-between px-5 py-3">
                  <span className="text-sm text-foreground">
                    {s.student.firstName} {s.student.lastName} →{" "}
                    {relationshipLabel(s.relationship)}
                  </span>
                  <Badge tone={s.status === "ACTIVE" ? "success" : "neutral"}>{s.status}</Badge>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}

// How a former child's last enrollment ended, in plain words.
const FORMER_LABEL: Record<string, string> = {
  GRADUATED: "Graduated",
  COMPLETED: "Completed",
  TRANSFERRED_OUT: "Transferred",
  WITHDRAWN: "Withdrawn",
  PROMOTED: "Former student",
  RETAINED: "Former student",
};

// One color per child card (category only, never a status).
const CHILD_TONES = [
  { bar: "bg-accent", soft: "bg-accent-soft", text: "text-accent" },
  { bar: "bg-violet-500", soft: "bg-violet-50", text: "text-violet-700" },
  { bar: "bg-teal-500", soft: "bg-teal-50", text: "text-teal-700" },
  { bar: "bg-amber-500", soft: "bg-amber-50", text: "text-amber-700" },
  { bar: "bg-rose-500", soft: "bg-rose-50", text: "text-rose-700" },
] as const;

function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

function SummaryStat({
  icon: Icon,
  tone,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  tone: string;
  label: string;
  value: number;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl bg-surface-soft p-3">
      <span className={`flex size-9 shrink-0 items-center justify-center rounded-lg ${tone}`}>
        <Icon className="size-4.5" />
      </span>
      <div className="min-w-0">
        <dd className="text-xl font-bold leading-none tabular-nums text-foreground">{value}</dd>
        <dt className="mt-1 truncate text-xs text-foreground-muted">{label}</dt>
      </div>
    </div>
  );
}

function Field({
  icon: Icon,
  tone,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  tone: string;
  label: string;
  value: string;
}) {
  return (
    <div className="flex min-w-0 items-center gap-3 rounded-xl border border-border p-3">
      <span className={`flex size-10 shrink-0 items-center justify-center rounded-lg ${tone}`}>
        <Icon className="size-4.5" />
      </span>
      <div className="min-w-0">
        <p className="text-xs font-medium uppercase tracking-wide text-foreground-muted">{label}</p>
        <p className="mt-0.5 truncate text-sm font-medium text-foreground">{value}</p>
      </div>
    </div>
  );
}

function EditParentForm({
  accessToken,
  schoolId,
  guardianId,
  parent,
  onCancel,
  onSaved,
}: {
  accessToken: string;
  schoolId: string;
  guardianId: string;
  parent: ParentDetail;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const { show } = useToast();
  const [firstName, setFirstName] = useState(parent.firstName);
  const [lastName, setLastName] = useState(parent.lastName);
  const [phone, setPhone] = useState(parent.phone ?? "");
  const [email, setEmail] = useState(parent.email ?? "");
  const [address, setAddress] = useState(parent.address ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await parentsApi.update(accessToken, schoolId, guardianId, {
        firstName,
        lastName,
        phone: phone || undefined,
        email: email || undefined,
        address: address || undefined,
      });
      show("Parent updated.");
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to update parent");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card padding="none" className="rounded-2xl">
      <CardHeader title="Edit parent" />
      <form onSubmit={onSubmit} className="space-y-4 p-5">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField label="First name" required>
            <Input required value={firstName} onChange={(e) => setFirstName(e.target.value)} />
          </FormField>
          <FormField label="Last name" required>
            <Input required value={lastName} onChange={(e) => setLastName(e.target.value)} />
          </FormField>
          <FormField label="Phone">
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
          </FormField>
          <FormField label="Email">
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </FormField>
          <FormField label="Address" className="sm:col-span-2">
            <Input value={address} onChange={(e) => setAddress(e.target.value)} />
          </FormField>
        </div>

        {error && <Alert tone="danger">{error}</Alert>}

        <div className="flex gap-2">
          <Button type="submit" size="sm" loading={saving}>
            Save changes
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </form>
    </Card>
  );
}

function AddChildForm({
  accessToken,
  schoolId,
  guardianId,
  existingStudentIds,
  onCancel,
  onAdded,
}: {
  accessToken: string;
  schoolId: string;
  guardianId: string;
  existingStudentIds: string[];
  onCancel: () => void;
  onAdded: () => void;
}) {
  const { show } = useToast();
  const [students, setStudents] = useState<StudentListItem[]>([]);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<StudentListItem | null>(null);
  const [relationship, setRelationship] = useState<GuardianRelationship>("FATHER");
  const [isPrimaryContact, setIsPrimaryContact] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.listStudents(accessToken, schoolId).then(setStudents).catch(() => setStudents([]));
  }, [accessToken, schoolId]);

  const results = students
    .filter((s) => !existingStudentIds.includes(s.studentId))
    .filter((s) => query.trim().length >= 2 && `${s.firstName} ${s.lastName}`.toLowerCase().includes(query.toLowerCase()));

  async function onSave() {
    if (!selected) return;
    setSaving(true);
    setError(null);
    try {
      await parentsApi.addChild(accessToken, schoolId, guardianId, {
        studentId: selected.studentId,
        relationship,
        isPrimaryContact,
      });
      show(`Linked to ${selected.firstName} ${selected.lastName}.`);
      onAdded();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to link student");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      {selected ? (
        <div className="space-y-4">
          <div className="rounded-lg border border-accent bg-accent-soft px-3 py-2">
            <p className="text-sm font-medium text-foreground">
              {selected.firstName} {selected.lastName}
            </p>
            <p className="text-xs text-foreground-soft">
              {selected.className} · {selected.sectionName}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Relationship" required>
              <Select value={relationship} onChange={(e) => setRelationship(e.target.value as GuardianRelationship)}>
                {RELATIONSHIPS.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </Select>
            </FormField>
            <label className="flex items-center gap-2 self-end pb-2 text-sm text-foreground-soft">
              <input
                type="checkbox"
                checked={isPrimaryContact}
                onChange={(e) => setIsPrimaryContact(e.target.checked)}
                className="size-4 rounded border-border text-accent focus:ring-accent/40"
              />
              Primary guardian
            </label>
          </div>
          {error && <Alert tone="danger">{error}</Alert>}
          <div className="flex gap-2">
            <Button size="sm" loading={saving} onClick={onSave}>
              Link {selected.firstName}
            </Button>
            <Button size="sm" variant="outline" onClick={() => setSelected(null)}>
              Back to search
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <Input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search students by name…" />
          {query.trim().length >= 2 && (
            <div className="max-h-56 space-y-1 overflow-y-auto">
              {results.length === 0 ? (
                <p className="px-1 py-2 text-sm text-foreground-muted">No matching student in this school.</p>
              ) : (
                results.map((s) => (
                  <button
                    key={s.studentId}
                    type="button"
                    onClick={() => setSelected(s)}
                    className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm hover:bg-surface-hover"
                  >
                    <span className="font-medium text-foreground">
                      {s.firstName} {s.lastName}
                    </span>
                    <span className="text-foreground-muted">
                      {s.className} · {s.sectionName}
                    </span>
                  </button>
                ))
              )}
            </div>
          )}
          <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      )}
    </Card>
  );
}
