"use client";

import { useEffect, useState } from "react";
import { useAuth, ApiError } from "@/lib/auth-context";
import { api, type Teacher, type TeacherAssignmentRecord } from "@/lib/api";
import { MyPhotoUpload } from "@/features/my-classes/components/MyPhotoUpload";
import { EditMyProfileForm } from "@/features/my-classes/EditMyProfileForm";
import { groupAssignmentsBySchool } from "@/features/my-classes/schoolGrouping";
import { SchoolCard } from "@/features/my-classes/components/SchoolCard";
import { SchoolClassesAndSubjects } from "@/features/my-classes/components/SchoolClassesAndSubjects";
import { DocumentsCard } from "@/features/teachers/components/DocumentsCard";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { EmptyState } from "@/components/ui/EmptyState";
import { SkeletonCards } from "@/components/ui/Skeleton";
import { Cake, GraduationCap, MapPin, Pencil, Phone, School as SchoolIcon, ShieldAlert, User } from "lucide-react";

const STATUS_TONE: Record<Teacher["status"], "success" | "warning" | "neutral"> = {
  ACTIVE: "success",
  ON_LEAVE: "warning",
  INACTIVE: "neutral",
};

export default function MyClassesPage() {
  const { accessToken, user } = useAuth();

  const [teacher, setTeacher] = useState<Teacher | null | undefined>(undefined);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [totalStudents, setTotalStudents] = useState<number | null>(null);

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

  // Total students is "how many distinct students am I responsible for",
  // not a per-assignment count — a student in two of my sections (or two
  // of my subjects in the same section, even across two different schools)
  // must only be counted once. There's no single endpoint for this, so we
  // fetch the roster once per distinct section and dedupe by studentId
  // client-side.
  useEffect(() => {
    if (!accessToken || !teacher) return;
    if (teacher.assignments.length === 0) {
      Promise.resolve().then(() => setTotalStudents(0));
      return;
    }
    const bySection = new Map<string, TeacherAssignmentRecord>();
    for (const a of teacher.assignments) bySection.set(a.section.id, a);

    Promise.all(
      Array.from(bySection.values()).map((a) =>
        api.myAssignmentStudents(accessToken, a.id).then((res) => res.students.map((s) => s.studentId)),
      ),
    )
      .then((lists) => setTotalStudents(new Set(lists.flat()).size))
      .catch(() => setTotalStudents(null));
  }, [accessToken, teacher]);

  const schools = teacher ? groupAssignmentsBySchool(teacher.assignments) : [];

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
            <SummaryStats schoolCount={schools.length} assignments={teacher.assignments} totalStudents={totalStudents} />

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
                    {teacher.teacherCode && (
                      <span className="font-mono text-xs font-medium text-accent" title="Your permanent Teacher ID">
                        {teacher.teacherCode}
                      </span>
                    )}
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

            <Card padding="none">
              <CardHeader
                title="My schools"
                description={
                  schools.length === 0
                    ? "No assignments yet."
                    : schools.length === 1
                      ? "You teach at 1 school. View your classes, subjects, and students."
                      : `You teach at ${schools.length} schools. Open one to see its classes and subjects.`
                }
              />
              <div className="space-y-2 p-5">
                {schools.length === 0 ? (
                  <EmptyState icon={GraduationCap} title="No assignments yet" description="Ask your School Admin to assign you to a class and subject." />
                ) : (
                  schools.map((school) => <SchoolCard key={school.id} school={school} />)
                )}
              </div>
            </Card>

            {/* Exactly one school: show its classes/subjects right here — no
                extra click required to select a school that isn't actually a
                choice. Two or more: the cards above are the real selection
                UI, and content only ever appears once one is opened. */}
            {schools.length === 1 && (
              <SchoolClassesAndSubjects
                school={schools[0]}
                schoolId={schools[0].id}
                canMarkAttendance={user?.permissions.includes("attendance.mark") ?? false}
              />
            )}

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

function SummaryStats({
  schoolCount,
  assignments,
  totalStudents,
}: {
  schoolCount: number;
  assignments: TeacherAssignmentRecord[];
  totalStudents: number | null;
}) {
  const totalClasses = new Set(assignments.map((a) => a.section.class.id)).size;
  const totalSections = new Set(assignments.map((a) => a.section.id)).size;
  const totalSubjects = new Set(assignments.map((a) => a.subject.id)).size;

  const stats: { label: string; value: number | null; icon?: React.ComponentType<{ className?: string }> }[] = [
    { label: "Schools", value: schoolCount, icon: SchoolIcon },
    { label: "Classes", value: totalClasses },
    { label: "Sections", value: totalSections },
    { label: "Subjects", value: totalSubjects },
    { label: "Students", value: totalStudents },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {stats.map((s) => (
        <Card key={s.label} padding="sm" className="text-center">
          <p className="text-2xl font-semibold text-foreground">{s.value ?? "—"}</p>
          <p className="text-xs font-medium uppercase tracking-wide text-foreground-muted">{s.label}</p>
        </Card>
      ))}
    </div>
  );
}
