"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
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
} from "@/lib/api";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { EmptyState } from "@/components/ui/EmptyState";
import { Select } from "@/components/ui/FormControls";
import { SkeletonCards } from "@/components/ui/Skeleton";
import {
  BookOpen,
  CalendarCheck,
  ClipboardCheck,
  GraduationCap,
  Users,
} from "lucide-react";

const TABS = ["Overview", "Students", "Subjects", "Teachers", "Attendance", "Exams & Results"] as const;
type Tab = (typeof TABS)[number];

export default function SectionWorkspacePage({
  params,
}: {
  params: Promise<{ id: string; classId: string; sectionId: string }>;
}) {
  const { id: schoolId, classId, sectionId } = use(params);
  const { accessToken } = useAuth();

  const [cls, setCls] = useState<ClassWithSections | null>(null);
  const [section, setSection] = useState<Section | null>(null);
  const [years, setYears] = useState<AcademicYear[]>([]);
  const [yearId, setYearId] = useState("");
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

  useEffect(() => {
    if (!accessToken || !yearId) return;
    api
      .listSectionStudents(accessToken, schoolId, classId, sectionId, yearId)
      .then(setStudents)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load students"));
    api
      .listSectionTeacherAssignments(accessToken, schoolId, classId, sectionId, yearId)
      .then(setTeacherAssignments)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load teacher assignments"));
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
          { label: cls.name, href: `/schools/${schoolId}/academic/classes/${classId}` },
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
        {tab === "Students" && <StudentsTab schoolId={schoolId} students={students} />}
        {tab === "Subjects" && (
          <SubjectsTab schoolId={schoolId} classSubjects={classSubjects} taughtSubjectIds={subjectsTaughtHere} />
        )}
        {tab === "Teachers" && <TeachersTab schoolId={schoolId} assignments={teacherAssignments} yearName={yearName} />}
        {tab === "Attendance" && <AttendanceTab href={attendanceHref()} />}
        {tab === "Exams & Results" && (
          <ExamsTab schoolId={schoolId} classId={classId} sectionId={sectionId} exams={examsForClass} yearName={yearName} />
        )}
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value }: { icon: React.ComponentType<{ className?: string }>; label: string; value: React.ReactNode }) {
  return (
    <Card>
      <div className="flex items-center gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">
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
      <StatCard icon={Users} label="Students" value={studentsCount ?? "…"} />
      <StatCard icon={BookOpen} label="Subjects taught" value={subjectsCount} />
      <StatCard icon={GraduationCap} label="Teachers" value={teachersCount} />
      <StatCard icon={ClipboardCheck} label="Capacity" value={section.capacity === null ? "Unlimited" : section.capacity} />
    </div>
  );
}

function StudentsTab({ schoolId, students }: { schoolId: string; students: SectionStudent[] | null }) {
  if (!students) return <SkeletonCards count={2} />;
  if (students.length === 0) {
    return <EmptyState icon={Users} title="No students in this section yet" description="Enroll a student into this section from Students → Add student." />;
  }
  return (
    <Card padding="none">
      <CardHeader title="Students" description={`${students.length} student(s) enrolled in this section.`} />
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

function TeachersTab({
  schoolId,
  assignments,
  yearName,
}: {
  schoolId: string;
  assignments: SectionTeacherAssignment[] | null;
  yearName: string;
}) {
  if (!assignments) return <SkeletonCards count={1} />;
  return (
    <Card padding="none">
      <CardHeader title="Teachers" description={`Who teaches this section's subjects in ${yearName || "the selected year"}.`} />
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
