"use client";

import { use, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useAuth, ApiError } from "@/lib/auth-context";
import {
  api,
  type AcademicYear,
  type ClassWithSections,
  type Division,
  type Exam,
  type ExamType,
  type Subject,
} from "@/lib/api";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { EmptyState } from "@/components/ui/EmptyState";
import { FormField, Input, Select } from "@/components/ui/FormControls";
import { SkeletonCards } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import { Plus } from "lucide-react";

const TABS = ["Years", "Classes & sections", "Subjects", "Exams"] as const;
type Tab = (typeof TABS)[number];

export default function AcademicStructurePage({ params }: { params: Promise<{ id: string }> }) {
  const { id: schoolId } = use(params);
  const { user, accessToken } = useAuth();

  const [divisions, setDivisions] = useState<Division[] | null>(null);
  const [years, setYears] = useState<AcademicYear[]>([]);
  const [classes, setClasses] = useState<ClassWithSections[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [exams, setExams] = useState<Exam[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("Years");

  useEffect(() => {
    if (!accessToken) return;
    // Deliberately not calling getSchool() here — that requires schools.view,
    // which a School Admin (the actual audience for this page) never has.
    // Everything this page needs is either scoped-by-URL or already on the
    // authenticated profile.
    Promise.all([
      api.listDivisions(accessToken, schoolId),
      api.listAcademicYears(accessToken, schoolId),
      api.listClasses(accessToken, schoolId),
      api.listSubjects(accessToken, schoolId),
      api.listExams(accessToken, schoolId),
    ])
      .then(([d, y, c, subj, ex]) => {
        setDivisions(d);
        setYears(y);
        setClasses(c);
        setSubjects(subj);
        setExams(ex);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load academic structure"));
  }, [accessToken, schoolId]);

  const canManage = user?.permissions.includes("academic.manage") ?? false;
  const schoolName = user?.schools.find((s) => s.id === schoolId)?.name ?? "School";

  return (
    <div>
      <PageHeader
        eyebrow="Academic structure"
        title={schoolName}
        breadcrumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "Academic" }]}
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
        {error ? (
          <Alert tone="danger">{error}</Alert>
        ) : !divisions ? (
          <SkeletonCards count={3} />
        ) : (
          <>
            {tab === "Years" && (
              <AcademicYearsSection schoolId={schoolId} accessToken={accessToken!} years={years} setYears={setYears} canManage={canManage} />
            )}
            {tab === "Classes & sections" && (
              <ClassesSection
                schoolId={schoolId}
                accessToken={accessToken!}
                classes={classes}
                setClasses={setClasses}
                years={years}
                canManage={canManage}
              />
            )}
            {tab === "Subjects" && (
              <SubjectsSection schoolId={schoolId} accessToken={accessToken!} subjects={subjects} setSubjects={setSubjects} canManage={canManage} />
            )}
            {tab === "Exams" && (
              <ExamsSection
                schoolId={schoolId}
                accessToken={accessToken!}
                years={years}
                classes={classes}
                subjects={subjects}
                exams={exams}
                setExams={setExams}
                canManage={user?.permissions.includes("results.approve") ?? false}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}

function AcademicYearsSection({
  schoolId,
  accessToken,
  years,
  setYears,
  canManage,
}: {
  schoolId: string;
  accessToken: string;
  years: AcademicYear[];
  setYears: (fn: (prev: AcademicYear[]) => AcademicYear[]) => void;
  canManage: boolean;
}) {
  const [name, setName] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const { show } = useToast();

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    try {
      const year = await api.createAcademicYear(accessToken, schoolId, { name, startDate, endDate });
      setYears((prev) => [year, ...prev]);
      setName("");
      setStartDate("");
      setEndDate("");
      show("Academic year added.");
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Failed to create academic year");
    }
  }

  async function onSetCurrent(id: string) {
    const updated = await api.setCurrentAcademicYear(accessToken, schoolId, id);
    setYears((prev) => prev.map((y) => (y.id === id ? updated : { ...y, isCurrent: false })));
    show(`${updated.name} set as the current academic year.`);
  }

  return (
    <div className="space-y-5">
      {years.length === 0 ? (
        <EmptyState title="No academic years yet" description="Add one to start enrolling students." />
      ) : (
        <div className="space-y-2">
          {years.map((y) => (
            <Card key={y.id} padding="sm">
              <div className="flex items-center justify-between p-2">
                <div>
                  <p className="font-medium text-foreground">{y.name}</p>
                  <p className="text-sm text-foreground-soft">
                    {new Date(y.startDate).toLocaleDateString()} – {new Date(y.endDate).toLocaleDateString()}
                  </p>
                </div>
                {y.isCurrent ? (
                  <Badge tone="success">Current</Badge>
                ) : (
                  canManage && (
                    <Button size="sm" variant="ghost" onClick={() => onSetCurrent(y.id)}>
                      Set current
                    </Button>
                  )
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      {canManage && (
        <Card>
          <h3 className="text-sm font-semibold text-foreground">Add academic year</h3>
          <form onSubmit={onCreate} className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-4">
            <FormField label="Name">
              <Input required value={name} onChange={(e) => setName(e.target.value)} placeholder="2027" />
            </FormField>
            <FormField label="Start">
              <Input required type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </FormField>
            <FormField label="End">
              <Input required type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </FormField>
            <div className="flex items-end">
              <Button type="submit" className="w-full">
                Add year
              </Button>
            </div>
            {formError && <Alert tone="danger" className="sm:col-span-4">{formError}</Alert>}
          </form>
        </Card>
      )}
    </div>
  );
}

function ClassesSection({
  schoolId,
  accessToken,
  classes,
  setClasses,
  years,
  canManage,
}: {
  schoolId: string;
  accessToken: string;
  classes: ClassWithSections[];
  setClasses: (fn: (prev: ClassWithSections[]) => ClassWithSections[]) => void;
  years: AcademicYear[];
  canManage: boolean;
}) {
  const currentYear = years.find((y) => y.isCurrent) ?? years[0];
  const [yearId, setYearId] = useState(currentYear?.id ?? "");

  // Class/Section are permanent structures reused every year — the year
  // selector doesn't filter which classes exist, only which year's roster
  // the enrolled-count badges reflect.
  useEffect(() => {
    if (!accessToken || !yearId) return;
    api.listClasses(accessToken, schoolId, yearId).then((list) => setClasses(() => list));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken, schoolId, yearId]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {years.length > 0 && (
          <FormField label="Academic Year" className="w-auto">
            <Select value={yearId} onChange={(e) => setYearId(e.target.value)} className="w-auto">
              {years.map((y) => (
                <option key={y.id} value={y.id}>
                  {y.name}
                  {y.isCurrent ? " (current)" : ""}
                </option>
              ))}
            </Select>
          </FormField>
        )}
        {canManage && (
          <Link href={`/schools/${schoolId}/academic/classes/new`} className="ml-auto">
            <Button icon={<Plus className="size-4" />}>Create class</Button>
          </Link>
        )}
      </div>

      {classes.length === 0 ? (
        <EmptyState title="No classes yet" description="Create your first class to start building the structure." />
      ) : (
        <div className="space-y-3">
          {classes.map((cls) => (
            <ClassRow key={cls.id} schoolId={schoolId} cls={cls} />
          ))}
        </div>
      )}
    </div>
  );
}

function ClassRow({ schoolId, cls }: { schoolId: string; cls: ClassWithSections }) {
  const totalStudents = cls.sections.reduce((sum, s) => sum + s._count.enrollments, 0);
  const allUnlimited = cls.sections.every((s) => s.capacity === null);

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-medium text-foreground">
            {cls.name} <span className="text-sm font-normal text-foreground-soft">· {cls.division.type}</span>
          </p>
          <p className="mt-0.5 text-sm text-foreground-soft">
            {cls.sections.length} Section{cls.sections.length === 1 ? "" : "s"} ·{" "}
            {allUnlimited ? "Unlimited Capacity" : `${totalStudents} student${totalStudents === 1 ? "" : "s"}`} ·{" "}
            {cls._count.classSubjects} Subject{cls._count.classSubjects === 1 ? "" : "s"}
          </p>
          <p className="mt-1.5 text-sm text-foreground-muted">
            {cls.sections.length === 0 ? "No sections yet." : cls.sections.map((s) => s.name).join(" · ")}
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Link href={`/schools/${schoolId}/academic/classes/${cls.id}`}>
            <Button size="sm" variant="outline">
              View
            </Button>
          </Link>
          <Link href={`/schools/${schoolId}/academic/classes/${cls.id}`}>
            <Button size="sm" variant="ghost">
              Edit
            </Button>
          </Link>
        </div>
      </div>
    </Card>
  );
}

function SubjectsSection({
  schoolId,
  accessToken,
  subjects,
  setSubjects,
  canManage,
}: {
  schoolId: string;
  accessToken: string;
  subjects: Subject[];
  setSubjects: (fn: (prev: Subject[]) => Subject[]) => void;
  canManage: boolean;
}) {
  const [name, setName] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const { show } = useToast();

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    try {
      const subject = await api.createSubject(accessToken, schoolId, { name });
      setSubjects((prev) => [...prev, subject]);
      setName("");
      show(`${subject.name} added.`);
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Failed to create subject");
    }
  }

  return (
    <div className="space-y-5">
      <Card>
        {subjects.length === 0 ? (
          <p className="text-sm text-foreground-muted">No subjects yet.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {subjects.map((s) => (
              <Link key={s.id} href={`/schools/${schoolId}/academic/subjects/${s.id}`}>
                <Badge>
                  {s.name}
                  {s.code && <span className="ml-1 font-mono text-foreground-muted">· {s.code}</span>}
                </Badge>
              </Link>
            ))}
          </div>
        )}

        {canManage && (
          <form onSubmit={onCreate} className="mt-4 flex flex-wrap items-end gap-2 border-t border-border pt-4">
            <div>
              <Input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Mathematics" />
              <p className="mt-1 text-xs text-foreground-muted">A subject code is generated automatically.</p>
            </div>
            <Button type="submit" size="sm" icon={<Plus className="size-4" />}>
              Add subject
            </Button>
            {formError && <p className="w-full text-sm text-danger">{formError}</p>}
          </form>
        )}
      </Card>
    </div>
  );
}

function ExamsSection({
  schoolId,
  accessToken,
  years,
  classes,
  subjects,
  exams,
  setExams,
  canManage,
}: {
  schoolId: string;
  accessToken: string;
  years: AcademicYear[];
  classes: ClassWithSections[];
  subjects: Subject[];
  exams: Exam[];
  setExams: (fn: (prev: Exam[]) => Exam[]) => void;
  canManage: boolean;
}) {
  const [name, setName] = useState("");
  const [type, setType] = useState<ExamType>("MIDTERM");
  const [academicYearId, setAcademicYearId] = useState(years[0]?.id ?? "");
  const [formError, setFormError] = useState<string | null>(null);
  const { show } = useToast();

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    try {
      const exam = await api.createExam(accessToken, schoolId, { name, type, academicYearId });
      setExams((prev) => [{ ...exam, examSubjects: [] }, ...prev]);
      setName("");
      show(`${exam.name} created.`);
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Failed to create exam");
    }
  }

  return (
    <div className="space-y-5">
      {exams.length === 0 ? (
        <EmptyState title="No exams yet" description="Set up an exam to start scheduling subjects for it." />
      ) : (
        <div className="space-y-3">
          {exams.map((exam) => (
            <ExamRow
              key={exam.id}
              schoolId={schoolId}
              accessToken={accessToken}
              exam={exam}
              classes={classes}
              subjects={subjects}
              setExams={setExams}
              canManage={canManage}
            />
          ))}
        </div>
      )}

      {canManage && years.length > 0 && (
        <Card>
          <h3 className="text-sm font-semibold text-foreground">Add exam</h3>
          <form onSubmit={onCreate} className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-4">
            <FormField label="Year">
              <Select value={academicYearId} onChange={(e) => setAcademicYearId(e.target.value)}>
                {years.map((y) => (
                  <option key={y.id} value={y.id}>
                    {y.name}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label="Name" className="sm:col-span-2">
              <Input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Midterm 2027" />
            </FormField>
            <FormField label="Type">
              <Select value={type} onChange={(e) => setType(e.target.value as ExamType)}>
                <option value="QUIZ">Quiz</option>
                <option value="MIDTERM">Midterm</option>
                <option value="FINAL">Final</option>
                <option value="ASSIGNMENT">Assignment</option>
                <option value="OTHER">Other</option>
              </Select>
            </FormField>
            <div className="sm:col-span-4">
              <Button type="submit">Add exam</Button>
            </div>
            {formError && <Alert tone="danger" className="sm:col-span-4">{formError}</Alert>}
          </form>
        </Card>
      )}
    </div>
  );
}

function ExamRow({
  schoolId,
  accessToken,
  exam,
  classes,
  subjects,
  setExams,
  canManage,
}: {
  schoolId: string;
  accessToken: string;
  exam: Exam;
  classes: ClassWithSections[];
  subjects: Subject[];
  setExams: (fn: (prev: Exam[]) => Exam[]) => void;
  canManage: boolean;
}) {
  const [classId, setClassId] = useState(classes[0]?.id ?? "");
  const [subjectId, setSubjectId] = useState(subjects[0]?.id ?? "");
  const [maxMarks, setMaxMarks] = useState("100");
  const [formError, setFormError] = useState<string | null>(null);
  const { show } = useToast();

  async function onAddSubject(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    try {
      const examSubject = await api.createExamSubject(accessToken, schoolId, exam.id, { classId, subjectId, maxMarks: Number(maxMarks) });
      setExams((prev) => prev.map((ex) => (ex.id === exam.id ? { ...ex, examSubjects: [...ex.examSubjects, examSubject] } : ex)));
      show("Subject scheduled for this exam.");
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Failed to add subject");
    }
  }

  return (
    <Card>
      <p className="font-medium text-foreground">
        {exam.name} <span className="text-sm font-normal text-foreground-soft">· {exam.type}</span>
      </p>

      <div className="mt-2 flex flex-wrap gap-2">
        {exam.examSubjects.map((es) => (
          <Badge key={es.id} tone="accent">
            {es.class.name} · {es.subject.name} · /{es.maxMarks}
          </Badge>
        ))}
        {exam.examSubjects.length === 0 && <span className="text-sm text-foreground-muted">No subjects scheduled yet.</span>}
      </div>

      {canManage && classes.length > 0 && subjects.length > 0 && (
        <form onSubmit={onAddSubject} className="mt-3 flex flex-wrap items-end gap-2">
          <Select value={classId} onChange={(e) => setClassId(e.target.value)} className="w-auto">
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
          <Select value={subjectId} onChange={(e) => setSubjectId(e.target.value)} className="w-auto">
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
          <Input type="number" min={1} value={maxMarks} onChange={(e) => setMaxMarks(e.target.value)} placeholder="Max marks" className="w-28" />
          <Button type="submit" size="sm" variant="outline">
            Add subject
          </Button>
          {formError && <p className="w-full text-sm text-danger">{formError}</p>}
        </form>
      )}
    </Card>
  );
}
