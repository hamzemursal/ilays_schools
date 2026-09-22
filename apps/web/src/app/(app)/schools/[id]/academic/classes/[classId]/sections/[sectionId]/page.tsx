"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useAuth, ApiError } from "@/lib/auth-context";
import {
  api,
  type AcademicYear,
  type ClassSubjectRecord,
  type ClassWithSections,
  type Exam,
  type Section,
  type SectionStudent,
  type SectionTeacherAssignment,
  type Teacher,
} from "@/lib/api";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { EmptyState } from "@/components/ui/EmptyState";
import { Select } from "@/components/ui/FormControls";
import { SkeletonCards } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import { DECORATIVE_TONE_CLASSES } from "@/components/ui/decorativeTones";
import { classSlug as toClassSlug, slugify } from "@/lib/slug";
import {
  BookOpen,
  CalendarCheck,
  ClipboardCheck,
  GraduationCap,
  Plus,
  UserPlus,
  Users,
} from "lucide-react";

const TABS = ["Overview", "Students", "Subjects", "Teachers", "Attendance", "Exams & Results"] as const;
type Tab = (typeof TABS)[number];

// Same resolver-wrapper pattern as the Class detail page above it in the
// drill-down (school -> class -> section) — the URL segments are
// human-readable slugs, resolved to real ids up front via the same
// resolveIdentifierOrThrow methods (and the same authorization), before the
// real page below ever runs, working with real ids exactly as it always has.
export default function SectionWorkspacePage({
  params,
}: {
  params: Promise<{ id: string; classId: string; sectionId: string }>;
}) {
  const { id: schoolSlug, classId: classSlugParam, sectionId: sectionSlugParam } = use(params);
  const { accessToken } = useAuth();
  const searchParams = useSearchParams();
  const yearFromUrl = searchParams.get("year");

  const [resolved, setResolved] = useState<{
    schoolId: string;
    schoolName: string;
    classId: string;
    sectionId: string;
    yearId: string | null;
  } | null>(null);
  const [resolveError, setResolveError] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken) return;
    let cancelled = false;
    // Same reasoning as the Class detail page's resolver: reset on every
    // fresh navigation, not just on unmount, so switching straight from one
    // section's clean URL to another never briefly shows the previous one.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setResolved(null);
    setResolveError(null);
    (async () => {
      try {
        const school = await api.resolveSchool(accessToken, schoolSlug);
        // The year first: a class slug names one class per academic year.
        const year = yearFromUrl ? await api.resolveAcademicYear(accessToken, school.id, yearFromUrl) : null;
        const cls = await api.resolveClass(accessToken, school.id, classSlugParam, year?.id);
        const section = await api.resolveSection(accessToken, school.id, cls.id, sectionSlugParam);
        if (!cancelled) {
          setResolved({
            schoolId: school.id,
            schoolName: school.name,
            classId: cls.id,
            sectionId: section.id,
            yearId: year?.id ?? null,
          });
        }
      } catch (err) {
        if (!cancelled) setResolveError(err instanceof ApiError ? err.message : "Section not found");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [accessToken, schoolSlug, classSlugParam, sectionSlugParam, yearFromUrl]);

  if (resolveError) return <Alert tone="danger">{resolveError}</Alert>;
  if (!resolved) return <SkeletonCards count={3} />;

  return (
    <SectionWorkspacePageInner
      schoolId={resolved.schoolId}
      schoolName={resolved.schoolName}
      classId={resolved.classId}
      sectionId={resolved.sectionId}
      initialYearId={resolved.yearId}
    />
  );
}

function SectionWorkspacePageInner({
  schoolId,
  schoolName,
  classId,
  sectionId,
  initialYearId,
}: {
  schoolId: string;
  schoolName: string;
  classId: string;
  sectionId: string;
  initialYearId: string | null;
}) {
  const { accessToken } = useAuth();

  const [cls, setCls] = useState<ClassWithSections | null>(null);
  const [section, setSection] = useState<Section | null>(null);
  const [years, setYears] = useState<AcademicYear[]>([]);
  const [yearId, setYearId] = useState(initialYearId ?? "");
  const [students, setStudents] = useState<SectionStudent[] | null>(null);
  const [classSubjects, setClassSubjects] = useState<ClassSubjectRecord[] | null>(null);
  const [teacherAssignments, setTeacherAssignments] = useState<SectionTeacherAssignment[] | null>(null);
  const [exams, setExams] = useState<Exam[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("Overview");

  // Class/section identity + the academic-year list only need loading once —
  // everything year-scoped below reloads whenever yearId changes instead.
  useEffect(() => {
    if (!accessToken) return;
    Promise.all([api.listClasses(accessToken, schoolId), api.listSections(accessToken, schoolId, classId), api.listAcademicYears(accessToken, schoolId)])
      .then(([classes, sections, y]) => {
        const foundClass = classes.find((c) => c.id === classId);
        const foundSection = sections.find((s) => s.id === sectionId);
        if (!foundClass || !foundSection) {
          setError("Section not found in this class");
          return;
        }
        setCls(foundClass);
        setSection(foundSection);
        setYears(y);
        setYearId((prev) => prev || (y.find((yr) => yr.isCurrent) ?? y[0])?.id || "");
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load section"));
  }, [accessToken, schoolId, classId, sectionId]);

  function refreshTeacherAssignments() {
    if (!accessToken || !yearId) return;
    api
      .listSectionTeacherAssignments(accessToken, schoolId, classId, sectionId, yearId)
      .then(setTeacherAssignments)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load teacher assignments"));
  }

  useEffect(() => {
    if (!accessToken || !yearId) return;
    api
      .listSectionStudents(accessToken, schoolId, classId, sectionId, yearId)
      .then(setStudents)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load students"));
    refreshTeacherAssignments();
    // refreshTeacherAssignments closes over the same accessToken/schoolId/
    // classId/sectionId/yearId this effect already depends on — safe to
    // omit, same reasoning as every other named-loader effect in this app.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken, schoolId, classId, sectionId, yearId]);

  useEffect(() => {
    if (!accessToken) return;
    api.listClassSubjects(accessToken, schoolId, classId).then(setClassSubjects);
    api.listExams(accessToken, schoolId).then(setExams);
  }, [accessToken, schoolId, classId]);

  if (error) return <Alert tone="danger">{error}</Alert>;
  if (!cls || !section) return <SkeletonCards count={3} />;

  const yearName = years.find((y) => y.id === yearId)?.name ?? "";
  const subjectsTaughtHere = new Set(teacherAssignments?.map((a) => a.subjectId) ?? []);
  const teachersHere = new Set(teacherAssignments?.map((a) => a.teacher.id) ?? []);
  const examsForClass =
    exams?.filter((e) => e.academicYearId === yearId && e.examSubjects.some((es) => es.classId === classId)) ?? [];

  function attendanceHref() {
    const query = new URLSearchParams({
      year: yearName,
      class: cls!.name,
      section: section!.name,
      backHref: `/schools/${schoolId}/academic/classes/${classId}/sections/${sectionId}`,
      backLabel: `Section ${section!.name}`,
    });
    return `/schools/${schoolId}/sections/${sectionId}/attendance?${query.toString()}`;
  }

  return (
    <div>
      <PageHeader
        eyebrow={`${cls.name} · ${cls.division.type}`}
        title={`Section ${section.name}`}
        breadcrumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Academic", href: `/schools/${schoolId}/academic?tab=Classes%20%26%20sections` },
          {
            label: cls.name,
            href: `/schools/${slugify(schoolName)}/academic/classes/${toClassSlug(cls.division.type, cls.level)}`,
          },
          { label: `Section ${section.name}` },
        ]}
        actions={
          years.length > 0 && (
            <Select value={yearId} onChange={(e) => setYearId(e.target.value)} className="w-auto">
              {years.map((y) => (
                <option key={y.id} value={y.id}>
                  {y.name}
                  {y.isCurrent ? " (current)" : ""}
                </option>
              ))}
            </Select>
          )
        }
      />

      <div className="border-b border-border px-4 sm:px-6">
        <div className="flex gap-1 overflow-x-auto">
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`shrink-0 border-b-2 px-3 py-3 text-sm font-medium transition-colors ${
                tab === t ? "border-accent text-accent" : "border-transparent text-foreground-soft hover:text-foreground"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      <div className="p-4 sm:p-6">
        {tab === "Overview" && (
          <OverviewTab
            section={section}
            studentsCount={students?.length}
            subjectsCount={subjectsTaughtHere.size}
            teachersCount={teachersHere.size}
          />
        )}
        {tab === "Students" && <StudentsTab schoolId={schoolId} classId={classId} sectionId={sectionId} students={students} />}
        {tab === "Subjects" && (
          <SubjectsTab schoolId={schoolId} classSubjects={classSubjects} taughtSubjectIds={subjectsTaughtHere} />
        )}
        {tab === "Teachers" && (
          <TeachersTab
            schoolId={schoolId}
            accessToken={accessToken!}
            sectionId={sectionId}
            yearId={yearId}
            yearName={yearName}
            assignments={teacherAssignments}
            classSubjects={classSubjects}
            taughtSubjectIds={subjectsTaughtHere}
            onAssigned={refreshTeacherAssignments}
          />
        )}
        {tab === "Attendance" && <AttendanceTab href={attendanceHref()} />}
        {tab === "Exams & Results" && (
          <ExamsTab schoolId={schoolId} classId={classId} sectionId={sectionId} exams={examsForClass} yearName={yearName} />
        )}
      </div>
    </div>
  );
}

const STAT_TONES = {
  accent: "bg-accent-soft text-accent",
  success: "bg-success-soft text-success",
  violet: DECORATIVE_TONE_CLASSES.violet,
  amber: DECORATIVE_TONE_CLASSES.amber,
} as const;

function StatCard({
  icon: Icon,
  label,
  value,
  tone = "accent",
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: React.ReactNode;
  tone?: keyof typeof STAT_TONES;
}) {
  return (
    <Card>
      <div className="flex items-center gap-3">
        <div className={`flex size-10 shrink-0 items-center justify-center rounded-lg ${STAT_TONES[tone]}`}>
          <Icon className="size-5" />
        </div>
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-foreground-muted">{label}</p>
          <p className="text-lg font-semibold text-foreground">{value}</p>
        </div>
      </div>
    </Card>
  );
}

function OverviewTab({
  section,
  studentsCount,
  subjectsCount,
  teachersCount,
}: {
  section: Section;
  studentsCount: number | undefined;
  subjectsCount: number;
  teachersCount: number;
}) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <StatCard icon={Users} label="Students" value={studentsCount ?? "…"} tone="accent" />
      <StatCard icon={BookOpen} label="Subjects taught" value={subjectsCount} tone="violet" />
      <StatCard icon={GraduationCap} label="Teachers" value={teachersCount} tone="success" />
      {section.capacity !== null && <StatCard icon={ClipboardCheck} label="Capacity" value={section.capacity} tone="amber" />}
    </div>
  );
}

function StudentsTab({
  schoolId,
  classId,
  sectionId,
  students,
}: {
  schoolId: string;
  classId: string;
  sectionId: string;
  students: SectionStudent[] | null;
}) {
  const addStudentHref = `/schools/${schoolId}/students/new?classId=${classId}&sectionId=${sectionId}`;

  if (!students) return <SkeletonCards count={2} />;
  if (students.length === 0) {
    return (
      <EmptyState
        icon={Users}
        title="No students in this section yet"
        description="Enroll a student directly into this class and section."
        action={
          <Link href={addStudentHref}>
            <Button size="sm" icon={<UserPlus className="size-4" />}>
              Add student
            </Button>
          </Link>
        }
      />
    );
  }
  return (
    <Card padding="none">
      <CardHeader
        title="Students"
        description={`${students.length} student(s) enrolled in this section.`}
        actions={
          <Link href={addStudentHref}>
            <Button size="sm" icon={<UserPlus className="size-4" />}>
              Add student
            </Button>
          </Link>
        }
      />
      <div className="overflow-x-auto">
        <table className="w-full min-w-[480px] text-left text-sm">
          <thead className="bg-surface-soft text-xs font-semibold uppercase tracking-wide text-foreground-muted">
            <tr>
              <th className="px-5 py-2.5">Roll No</th>
              <th className="px-5 py-2.5">Student ID</th>
              <th className="px-5 py-2.5">Name</th>
              <th className="px-5 py-2.5" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {students.map((s) => (
              <tr key={s.enrollmentId} className="transition-colors hover:bg-surface-hover">
                <td className="px-5 py-3 tabular-nums text-foreground-soft">{s.rollNumber}</td>
                <td className="px-5 py-3 font-mono text-xs text-foreground-soft">{s.studentNumber}</td>
                <td className="px-5 py-3 font-medium text-foreground">
                  {s.firstName} {s.lastName}
                </td>
                <td className="px-5 py-3 text-right">
                  <Link href={`/schools/${schoolId}/students/${s.studentId}`} className="text-sm font-medium text-accent hover:underline">
                    View / Edit
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function SubjectsTab({
  schoolId,
  classSubjects,
  taughtSubjectIds,
}: {
  schoolId: string;
  classSubjects: ClassSubjectRecord[] | null;
  taughtSubjectIds: Set<string>;
}) {
  if (!classSubjects) return <SkeletonCards count={1} />;
  return (
    <Card padding="none">
      <CardHeader
        title="Subjects"
        description="Subjects are assigned at the class level and shared by every section of this class — the badge below shows which ones already have a teacher assigned specifically to this section."
      />
      {classSubjects.length === 0 ? (
        <div className="p-5">
          <EmptyState icon={BookOpen} title="No subjects assigned to this class yet" />
        </div>
      ) : (
        <div className="divide-y divide-border">
          {classSubjects.map((cs) => (
            <div key={cs.subjectId} className="flex items-center justify-between gap-3 px-5 py-3">
              <Link href={`/schools/${schoolId}/academic/subjects/${cs.subjectId}`} className="text-sm font-medium text-foreground hover:underline">
                {cs.subject.name}
                {cs.subject.code && <span className="ml-1.5 font-mono text-xs text-foreground-muted">· {cs.subject.code}</span>}
              </Link>
              {taughtSubjectIds.has(cs.subjectId) ? (
                <Badge tone="success">Taught in this section</Badge>
              ) : (
                <Badge tone="neutral">No teacher assigned here yet</Badge>
              )}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

const ASSIGN_CHECKBOX_CLASS =
  "size-4 shrink-0 rounded border-border text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40";

function TeachersTab({
  schoolId,
  accessToken,
  sectionId,
  yearId,
  yearName,
  assignments,
  classSubjects,
  taughtSubjectIds,
  onAssigned,
}: {
  schoolId: string;
  accessToken: string;
  sectionId: string;
  yearId: string;
  yearName: string;
  assignments: SectionTeacherAssignment[] | null;
  classSubjects: ClassSubjectRecord[] | null;
  taughtSubjectIds: Set<string>;
  onAssigned: () => void;
}) {
  const { show } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [allTeachers, setAllTeachers] = useState<Teacher[] | null>(null);
  const [teacherId, setTeacherId] = useState("");
  const [subjectIds, setSubjectIds] = useState<Set<string>>(new Set());
  const [assigning, setAssigning] = useState(false);
  const [assignError, setAssignError] = useState<string | null>(null);

  function openForm() {
    setShowForm(true);
    setAssignError(null);
    if (!allTeachers) api.listTeachers(accessToken, schoolId).then(setAllTeachers);
  }

  function toggleSubject(subjectId: string, checked: boolean) {
    const next = new Set(subjectIds);
    if (checked) next.add(subjectId);
    else next.delete(subjectId);
    setSubjectIds(next);
  }

  const assignableSubjects = (classSubjects ?? []).filter((cs) => !taughtSubjectIds.has(cs.subjectId));

  async function onAssign() {
    if (!teacherId || subjectIds.size === 0) return;
    setAssigning(true);
    setAssignError(null);
    try {
      const results = await Promise.allSettled(
        Array.from(subjectIds).map((subjectId) =>
          api.addTeacherAssignment(accessToken, schoolId, teacherId, { academicYearId: yearId, sectionId, subjectId }),
        ),
      );
      const failed = results.filter((r) => r.status === "rejected").length;
      const added = results.length - failed;
      if (failed > 0) {
        setAssignError(`Assigned ${added} of ${results.length} subject(s) — the rest failed.`);
      } else {
        show(`${added} subject assignment${added === 1 ? "" : "s"} added.`);
        setShowForm(false);
      }
      setTeacherId("");
      setSubjectIds(new Set());
      onAssigned();
    } catch (err) {
      setAssignError(err instanceof ApiError ? err.message : "Failed to assign teacher");
    } finally {
      setAssigning(false);
    }
  }

  if (!assignments) return <SkeletonCards count={1} />;

  return (
    <Card padding="none">
      <CardHeader
        title="Teachers"
        description={`Who teaches this section's subjects in ${yearName || "the selected year"}.`}
        actions={
          <div className="flex gap-2">
            <Button size="sm" variant="outline" icon={<Plus className="size-4" />} onClick={openForm} disabled={showForm}>
              Assign teacher
            </Button>
            <Link href={`/schools/${schoolId}/teachers/new`}>
              <Button size="sm" variant="ghost" icon={<UserPlus className="size-4" />}>
                Add new teacher
              </Button>
            </Link>
          </div>
        }
      />

      {showForm && (
        <div className="space-y-3 border-b border-border bg-surface-soft p-5">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-foreground-muted">Teacher</label>
              <Select value={teacherId} onChange={(e) => setTeacherId(e.target.value)} disabled={!allTeachers}>
                <option value="">{allTeachers ? "Select a teacher…" : "Loading…"}</option>
                {allTeachers?.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.firstName} {t.lastName}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-foreground-muted">Subjects</label>
            {assignableSubjects.length === 0 ? (
              <p className="rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground-muted">
                Every subject in this class is already assigned to a teacher for this section.
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-1 rounded-lg border border-border bg-background p-2 sm:grid-cols-3">
                {assignableSubjects.map((cs) => (
                  <label
                    key={cs.subjectId}
                    className={`flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm ${
                      subjectIds.has(cs.subjectId) ? "bg-accent-soft text-accent" : "hover:bg-surface-hover"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={subjectIds.has(cs.subjectId)}
                      onChange={(e) => toggleSubject(cs.subjectId, e.target.checked)}
                      className={ASSIGN_CHECKBOX_CLASS}
                    />
                    <span className="truncate font-medium">{cs.subject.name}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          {assignError && <Alert tone="danger">{assignError}</Alert>}

          <div className="flex gap-2">
            <Button
              size="sm"
              loading={assigning}
              disabled={!teacherId || subjectIds.size === 0}
              onClick={onAssign}
            >
              {subjectIds.size > 0 ? `Assign ${subjectIds.size} subject${subjectIds.size === 1 ? "" : "s"}` : "Assign"}
            </Button>
            <Button size="sm" variant="outline" onClick={() => setShowForm(false)} disabled={assigning}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {assignments.length === 0 ? (
        <div className="p-5">
          <EmptyState icon={GraduationCap} title="No teacher assigned to this section yet" />
        </div>
      ) : (
        <div className="divide-y divide-border">
          {assignments.map((a) => (
            <div key={a.id} className="flex items-center justify-between gap-3 px-5 py-3">
              <Link href={`/schools/${schoolId}/teachers/${a.teacher.id}`} className="text-sm font-medium text-foreground hover:underline">
                {a.teacher.firstName} {a.teacher.lastName}
              </Link>
              <Badge tone="accent">{a.subject.name}</Badge>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function AttendanceTab({ href }: { href: string }) {
  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Attendance for this section</h3>
          <p className="mt-0.5 text-sm text-foreground-soft">Mark or review attendance — scoped to only this section&apos;s students.</p>
        </div>
        <Link href={href}>
          <Button icon={<CalendarCheck className="size-4" />}>Open attendance</Button>
        </Link>
      </div>
    </Card>
  );
}

function ExamsTab({
  schoolId,
  classId,
  sectionId,
  exams,
  yearName,
}: {
  schoolId: string;
  classId: string;
  sectionId: string;
  exams: Exam[];
  yearName: string;
}) {
  if (exams.length === 0) {
    return <EmptyState icon={ClipboardCheck} title="No exams scheduled for this class yet" description={`Nothing set up for ${yearName || "the selected year"}.`} />;
  }
  return (
    <div className="space-y-3">
      {exams.map((exam) => {
        const subjectsForClass = exam.examSubjects.filter((es) => es.classId === classId);
        return (
          <Card key={exam.id} padding="none">
            <CardHeader title={exam.name} description={`${exam.type} · ${subjectsForClass.length} subject(s) for this class`} />
            <div className="divide-y divide-border">
              {subjectsForClass.map((es) => (
                <div key={es.id} className="flex items-center justify-between gap-3 px-5 py-3">
                  <span className="text-sm font-medium text-foreground">{es.subject.name}</span>
                  <Link
                    href={`/schools/${schoolId}/exam-subjects/${es.id}/sections/${sectionId}/results`}
                    className="text-sm font-medium text-accent hover:underline"
                  >
                    View results
                  </Link>
                </div>
              ))}
            </div>
          </Card>
        );
      })}
    </div>
  );
}
