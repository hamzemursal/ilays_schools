"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth, ApiError } from "@/lib/auth-context";
import { api, type Teacher, type TeacherAssignmentRecord } from "@/lib/api";
import { MyPhotoUpload } from "@/features/my-classes/components/MyPhotoUpload";
import { EditMyProfileForm } from "@/features/my-classes/EditMyProfileForm";
import { DocumentsCard } from "@/features/teachers/components/DocumentsCard";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { EmptyState } from "@/components/ui/EmptyState";
import { SkeletonCards } from "@/components/ui/Skeleton";
import { Cake, GraduationCap, MapPin, Pencil, Phone, ShieldAlert, User } from "lucide-react";

const STATUS_TONE: Record<Teacher["status"], "success" | "warning" | "neutral"> = {
  ACTIVE: "success",
  ON_LEAVE: "warning",
  INACTIVE: "neutral",
};

export default function MyClassesPage() {
  const { accessToken } = useAuth();

  const [teacher, setTeacher] = useState<Teacher | null | undefined>(undefined);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken) return;
    api
      .getMyTeacherProfile(accessToken)
      .then(setTeacher)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load your profile"));
    api
      .getMyPhotoUrl(accessToken)
      .then((res) => setPhotoUrl(res.url))
      .catch(() => setPhotoUrl(null));
  }, [accessToken]);

  return (
    <div>
      <PageHeader eyebrow="Teaching" title="My classes" breadcrumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "My classes" }]} />

      <div className="space-y-5 p-4 sm:p-6">
        {error ? (
          <Alert tone="danger">{error}</Alert>
        ) : teacher === undefined || !accessToken ? (
          <SkeletonCards count={3} />
        ) : teacher === null ? (
          <EmptyState icon={GraduationCap} title="No teacher profile" description="This account isn't linked to a teacher profile." />
        ) : (
          <>
            <Card>
              <div className="flex flex-wrap items-center gap-4">
                <MyPhotoUpload accessToken={accessToken} name={`${teacher.firstName} ${teacher.lastName}`} size="lg" photoUrl={photoUrl} onUploaded={setPhotoUrl} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h1 className="text-lg font-semibold text-foreground">
                      {teacher.firstName} {teacher.lastName}
                    </h1>
                    <Badge tone={STATUS_TONE[teacher.status]}>{teacher.status.replace("_", " ")}</Badge>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-foreground-soft">
                    <span className="font-mono text-xs text-foreground-muted">#{teacher.employeeNumber}</span>
                    {teacher.phone && (
                      <span className="inline-flex items-center gap-1.5">
                        <Phone className="size-3.5" /> {teacher.phone}
                      </span>
                    )}
                    {teacher.email && <span>{teacher.email}</span>}
                  </div>
                </div>
                {!editing && (
                  <Button size="sm" variant="outline" icon={<Pencil className="size-4" />} onClick={() => setEditing(true)}>
                    Edit my profile
                  </Button>
                )}
              </div>

              <div className="mt-4 grid grid-cols-2 gap-4 border-t border-border pt-4 sm:grid-cols-3 lg:grid-cols-4">
                <Field icon={User} label="Gender" value={teacher.sex === "MALE" ? "Male" : teacher.sex === "FEMALE" ? "Female" : "—"} />
                <Field icon={Cake} label="Date of birth" value={teacher.dateOfBirth ? new Date(teacher.dateOfBirth).toLocaleDateString() : "—"} />
                <Field icon={MapPin} label="Address" value={teacher.address ?? "—"} />
                <Field label="Qualification" value={teacher.qualification ?? "—"} />
                <Field label="Specialization" value={teacher.specialization ?? "—"} />
                <Field
                  label="Employment date"
                  value={teacher.employmentDate ? new Date(teacher.employmentDate).toLocaleDateString() : "—"}
                />
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
              <p className="mt-3 text-xs text-foreground-muted">
                Name, employee code, qualification, employment details, and status are managed by your School Admin.
              </p>
            </Card>

            {editing && (
              <EditMyProfileForm
                accessToken={accessToken}
                teacher={teacher}
                onCancel={() => setEditing(false)}
                onSaved={(updated) => {
                  setTeacher(updated);
                  setEditing(false);
                }}
              />
            )}

            <AssignmentsCard assignments={teacher.assignments} />

            <DocumentsCard
              canUpload
              list={() => api.listMyDocuments(accessToken)}
              upload={(file, label) => api.uploadMyDocument(accessToken, file, label)}
            />
          </>
        )}
      </div>
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

function AssignmentsCard({ assignments }: { assignments: TeacherAssignmentRecord[] }) {
  const byYear = assignments.reduce<Record<string, TeacherAssignmentRecord[]>>((acc, a) => {
    (acc[a.academicYear.name] ??= []).push(a);
    return acc;
  }, {});

  return (
    <Card padding="none">
      <CardHeader title="My classes" description="Every class, section, and subject you're assigned to teach." />
      <div className="space-y-4 p-5">
        {assignments.length === 0 ? (
          <EmptyState icon={GraduationCap} title="No assignments yet" description="Ask your School Admin to assign you to a class and subject." />
        ) : (
          Object.entries(byYear).map(([yearName, list]) => (
            <div key={yearName}>
              <p className="text-xs font-semibold uppercase tracking-wide text-foreground-muted">{yearName}</p>
              <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {list.map((a) => (
                  <Link key={a.id} href={`/my-classes/${a.id}`}>
                    <Card padding="sm" className="transition-colors hover:border-accent">
                      <p className="font-medium text-foreground">
                        {a.section.class.name} · {a.section.name}
                      </p>
                      <p className="text-sm text-foreground-soft">{a.subject.name}</p>
                    </Card>
                  </Link>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </Card>
  );
}
