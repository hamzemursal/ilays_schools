"use client";

import { use, useEffect, useState, type FormEvent } from "react";
import { useAuth, ApiError } from "@/lib/auth-context";
import { api, type AcademicYear, type ClassWithSections, type Division, type Exam, type ExamType, type Subject } from "@/lib/api";
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
                divisions={divisions}
                classes={classes}
                setClasses={setClasses}
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
  divisions,
  classes,
  setClasses,
  canManage,
}: {
  schoolId: string;
  accessToken: string;
  divisions: Division[];
  classes: ClassWithSections[];
  setClasses: (fn: (prev: ClassWithSections[]) => ClassWithSections[]) => void;
  canManage: boolean;
}) {
  const [divisionId, setDivisionId] = useState(divisions[0]?.id ?? "");
  const [name, setName] = useState("");
  const [level, setLevel] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const { show } = useToast();

  async function onCreateClass(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    try {
      const created = await api.createClass(accessToken, schoolId, { divisionId, name, level: Number(level) });
      setClasses((prev) => [...prev, created]);
      setName("");
      setLevel("");
      show(`${created.name} added.`);
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Failed to create class");
    }
  }

  return (
    <div className="space-y-5">
      {classes.length === 0 ? (
        <EmptyState title="No classes yet" description="Add your first class to start building the structure." />
      ) : (
        <div className="space-y-3">
          {classes.map((cls) => (
            <ClassRow key={cls.id} schoolId={schoolId} accessToken={accessToken} cls={cls} canManage={canManage} />
          ))}
        </div>
      )}

      {canManage && divisions.length > 0 && (
        <Card>
          <h3 className="text-sm font-semibold text-foreground">Add class</h3>
          <form onSubmit={onCreateClass} className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-4">
            <FormField label="Division">
              <Select value={divisionId} onChange={(e) => setDivisionId(e.target.value)}>
                {divisions.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.type}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label="Name">
              <Input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Class 7" />
            </FormField>
            <FormField label="Level">
              <Input required type="number" min={1} value={level} onChange={(e) => setLevel(e.target.value)} placeholder="7" />
            </FormField>
            <div className="flex items-end">
              <Button type="submit" className="w-full">
                Add class
              </Button>
            </div>
            {formError && <Alert tone="danger" className="sm:col-span-4">{formError}</Alert>}
          </form>
        </Card>
      )}
    </div>
  );
}

function ClassRow({
  schoolId,
  accessToken,
  cls,
  canManage,
}: {
  schoolId: string;
  accessToken: string;
  cls: ClassWithSections;
  canManage: boolean;
}) {
  const [sections, setSections] = useState(cls.sections);
  const [name, setName] = useState("");
  const [capacity, setCapacity] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const { show } = useToast();

  async function onCreateSection(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    try {
      const section = await api.createSection(accessToken, schoolId, cls.id, { name, capacity: Number(capacity) });
      setSections((prev) => [...prev, section]);
      setName("");
      setCapacity("");
      show(`Section ${section.name} added to ${cls.name}.`);
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Failed to create section");
    }
  }

  return (
    <Card>
      <p className="font-medium text-foreground">
        {cls.name} <span className="text-sm font-normal text-foreground-soft">· {cls.division.type}</span>
      </p>

      <div className="mt-2 flex flex-wrap gap-2">
        {sections.map((s) => (
          <Badge key={s.id} tone="accent">
            {s.name} · capacity {s.capacity}
          </Badge>
        ))}
        {sections.length === 0 && <span className="text-sm text-foreground-muted">No sections yet.</span>}
      </div>

      {canManage && (
        <form onSubmit={onCreateSection} className="mt-3 flex flex-wrap items-end gap-2">
          <Input required value={name} onChange={(e) => setName(e.target.value)} placeholder="A" className="w-20" />
          <Input
            required
            type="number"
            min={1}
            value={capacity}
            onChange={(e) => setCapacity(e.target.value)}
            placeholder="Capacity"
            className="w-28"
          />
          <Button type="submit" size="sm" variant="outline" icon={<Plus className="size-4" />}>
            Add section
          </Button>
          {formError && <p className="w-full text-sm text-danger">{formError}</p>}
        </form>
      )}
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
              <Badge key={s.id}>{s.name}</Badge>
            ))}
          </div>
        )}

        {canManage && (
          <form onSubmit={onCreate} className="mt-4 flex flex-wrap items-end gap-2 border-t border-border pt-4">
            <Input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Mathematics" />
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
