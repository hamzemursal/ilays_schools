"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth, ApiError } from "@/lib/auth-context";
import { api, type ClassWithSections, type Subject, type Teacher } from "@/lib/api";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/FormControls";
import { SkeletonCards } from "@/components/ui/Skeleton";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useToast } from "@/components/ui/Toast";
import { BookUser, Check, GraduationCap, Pencil, Trash2, X } from "lucide-react";

export default function SubjectDetailPage({ params }: { params: Promise<{ id: string; subjectId: string }> }) {
  const { id: schoolId, subjectId } = use(params);
  const { user, accessToken } = useAuth();
  const { show } = useToast();
  const router = useRouter();

  const [subject, setSubject] = useState<Subject | null>(null);
  const [classesTaughtIn, setClassesTaughtIn] = useState<ClassWithSections[] | null>(null);
  const [teachers, setTeachers] = useState<Teacher[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [savingName, setSavingName] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!accessToken) return;
    Promise.all([api.listSubjects(accessToken, schoolId), api.listClasses(accessToken, schoolId), api.listTeachers(accessToken, schoolId)])
      .then(async ([subjects, classes, allTeachers]) => {
        const found = subjects.find((s) => s.id === subjectId);
        if (!found) {
          setError("Subject not found");
          return;
        }
        setSubject(found);
        setTeachers(allTeachers);

        // ClassSubject is the authoritative "is this subject offered in this
        // class" relationship — checked per class since there's no reverse
        // lookup endpoint (subject -> classes) on the backend.
        const perClass = await Promise.all(
          classes.map((c) => api.listClassSubjects(accessToken, schoolId, c.id).then((rows) => ({ c, rows }))),
        );
        setClassesTaughtIn(perClass.filter(({ rows }) => rows.some((r) => r.subjectId === subjectId)).map(({ c }) => c));
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load subject"));
  }, [accessToken, schoolId, subjectId]);

  const canManage = user?.permissions.includes("academic.manage") ?? false;

  function startRename() {
    if (!subject) return;
    setNameDraft(subject.name);
    setEditingName(true);
  }

  async function onSaveName() {
    if (!accessToken || !nameDraft.trim()) return;
    setSavingName(true);
    try {
      const updated = await api.updateSubject(accessToken, schoolId, subjectId, { name: nameDraft.trim() });
      setSubject(updated);
      setEditingName(false);
      show("Subject renamed.");
    } catch (err) {
      show(err instanceof ApiError ? err.message : "Failed to rename subject", "danger");
    } finally {
      setSavingName(false);
    }
  }

  async function onDelete() {
    if (!accessToken) return;
    setDeleting(true);
    try {
      await api.removeSubject(accessToken, schoolId, subjectId);
      show("Subject deleted.");
      router.push(`/schools/${schoolId}/academic`);
    } catch (err) {
      show(err instanceof ApiError ? err.message : "Failed to delete subject", "danger");
      setShowDeleteConfirm(false);
    } finally {
      setDeleting(false);
    }
  }

  const schoolName = user?.schools.find((s) => s.id === schoolId)?.name ?? "School";

  const teachersForSubject = (teachers ?? [])
    .flatMap((t) => t.assignments.filter((a) => a.subject.id === subjectId).map((a) => ({ teacher: t, assignment: a })))
    .reduce<{ teacher: Teacher; sections: string[] }[]>((acc, { teacher, assignment }) => {
      const existing = acc.find((x) => x.teacher.id === teacher.id);
      if (existing) existing.sections.push(assignment.section.name);
      else acc.push({ teacher, sections: [assignment.section.name] });
      return acc;
    }, []);

  if (error) {
    return (
      <div className="p-4 sm:p-6">
        <Alert tone="danger">{error}</Alert>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        eyebrow="Subject"
        title={subject ? subject.name : "Loading…"}
        description={subject?.code ? `Code: ${subject.code}` : undefined}
        breadcrumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Academic", href: `/schools/${schoolId}/academic` },
          { label: schoolName },
        ]}
        actions={
          subject && canManage ? (
            <>
              <Button variant="outline" size="sm" icon={<Pencil className="size-4" />} onClick={startRename}>
                Rename
              </Button>
              <Button
                variant="danger"
                size="sm"
                icon={<Trash2 className="size-4" />}
                onClick={() => setShowDeleteConfirm(true)}
              >
                Delete
              </Button>
            </>
          ) : undefined
        }
      />

      <ConfirmDialog
        open={showDeleteConfirm}
        title={`Delete ${subject?.name ?? "this subject"}?`}
        description="This cannot be undone. Deletion is blocked if this subject has any exam, teacher assignment, or class link."
        confirmLabel="Delete subject"
        loading={deleting}
        onConfirm={onDelete}
        onCancel={() => setShowDeleteConfirm(false)}
      />

      <div className="space-y-5 p-4 sm:p-6">
        {!subject || !classesTaughtIn || !teachers ? (
          <SkeletonCards count={2} />
        ) : (
          <>
            {editingName && (
              <Card>
                <div className="flex flex-wrap items-end gap-2">
                  <div className="min-w-[200px] flex-1">
                    <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-foreground-muted">
                      Subject name
                    </label>
                    <Input value={nameDraft} onChange={(e) => setNameDraft(e.target.value)} />
                  </div>
                  <Button
                    size="sm"
                    icon={<Check className="size-4" />}
                    loading={savingName}
                    disabled={!nameDraft.trim()}
                    onClick={onSaveName}
                  >
                    Save
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    icon={<X className="size-4" />}
                    onClick={() => setEditingName(false)}
                    disabled={savingName}
                  >
                    Cancel
                  </Button>
                </div>
              </Card>
            )}

            <Card padding="none">
              <CardHeader title="Taught in" description="Classes this subject is assigned to." />
              <div className="p-5">
                {classesTaughtIn.length === 0 ? (
                  <EmptyState icon={GraduationCap} title="Not assigned to any class yet" description="Assign it from a class's page in Academic." />
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {classesTaughtIn.map((c) => (
                      <Link key={c.id} href={`/schools/${schoolId}/academic/classes/${c.id}`}>
                        <Badge tone="accent">{c.name}</Badge>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            </Card>

            <Card padding="none">
              <CardHeader title="Teachers" description="Staff currently assigned to teach this subject." />
              <div className="p-5">
                {teachersForSubject.length === 0 ? (
                  <EmptyState icon={BookUser} title="No teacher assigned yet" description="Assign a teacher from the Teachers page." />
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {teachersForSubject.map(({ teacher, sections }) => (
                      <Link key={teacher.id} href={`/schools/${schoolId}/teachers/${teacher.id}`}>
                        <Badge>
                          {teacher.firstName} {teacher.lastName} · {sections.join(", ")}
                        </Badge>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
