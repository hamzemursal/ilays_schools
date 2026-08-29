"use client";

import { use, useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useAuth, ApiError } from "@/lib/auth-context";
import { api, type AcademicYear, type ClassWithSections, type Division, type Exam, type ExamType, type Subject } from "@/lib/api";

export default function AcademicStructurePage({ params }: { params: Promise<{ id: string }> }) {
  const { id: schoolId } = use(params);
  const router = useRouter();
  const { user, accessToken, loading } = useAuth();

  const [divisions, setDivisions] = useState<Division[] | null>(null);
  const [years, setYears] = useState<AcademicYear[]>([]);
  const [classes, setClasses] = useState<ClassWithSections[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [exams, setExams] = useState<Exam[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) router.push("/login");
  }, [loading, user, router]);

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

  if (loading || !user) return <p className="p-8 text-foreground-soft">Loading…</p>;
  if (error) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-16">
        <p className="rounded-lg bg-danger-soft px-4 py-3 text-danger">{error}</p>
      </div>
    );
  }
  if (!divisions) return <p className="p-8 text-foreground-soft">Loading…</p>;

  const canManage = user.permissions.includes("academic.manage");
  const schoolName = user.schools.find((s) => s.id === schoolId)?.name ?? "School";

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6 sm:py-16">
      <span className="text-sm font-semibold uppercase tracking-wide text-accent">Academic structure</span>
      <h1 className="mt-1 text-2xl font-semibold text-foreground">{schoolName}</h1>

      <AcademicYearsSection
        schoolId={schoolId}
        accessToken={accessToken!}
        years={years}
        setYears={setYears}
        canManage={canManage}
      />

      <ClassesSection
        schoolId={schoolId}
        accessToken={accessToken!}
        divisions={divisions}
        classes={classes}
        setClasses={setClasses}
        canManage={canManage}
      />

      <SubjectsSection
        schoolId={schoolId}
        accessToken={accessToken!}
        subjects={subjects}
        setSubjects={setSubjects}
        canManage={canManage}
      />

      <ExamsSection
        schoolId={schoolId}
        accessToken={accessToken!}
        years={years}
        classes={classes}
        subjects={subjects}
        exams={exams}
        setExams={setExams}
        canManage={user.permissions.includes("results.approve")}
      />
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

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    try {
      const year = await api.createAcademicYear(accessToken, schoolId, { name, startDate, endDate });
      setYears((prev) => [year, ...prev]);
      setName("");
      setStartDate("");
      setEndDate("");
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Failed to create academic year");
    }
  }

  async function onSetCurrent(id: string) {
    const updated = await api.setCurrentAcademicYear(accessToken, schoolId, id);
    setYears((prev) => prev.map((y) => (y.id === id ? updated : { ...y, isCurrent: false })));
  }

  return (
    <section className="mt-8">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-foreground-soft">Academic years</h2>

      <ul className="mt-2 space-y-2">
        {years.map((y) => (
          <li
            key={y.id}
            className="flex items-center justify-between rounded-xl border border-border bg-surface p-4"
          >
            <div>
              <p className="font-medium text-foreground">{y.name}</p>
              <p className="text-sm text-foreground-soft">
                {new Date(y.startDate).toLocaleDateString()} – {new Date(y.endDate).toLocaleDateString()}
              </p>
            </div>
            {y.isCurrent ? (
              <span className="rounded-full bg-success-soft px-3 py-1 text-xs font-medium text-success">
                Current
              </span>
            ) : (
              canManage && (
                <button
                  onClick={() => onSetCurrent(y.id)}
                  className="text-sm text-accent hover:underline"
                >
                  Set current
                </button>
              )
            )}
          </li>
        ))}
        {years.length === 0 && <p className="text-sm text-foreground-soft">No academic years yet.</p>}
      </ul>

      {canManage && (
        <form onSubmit={onCreate} className="mt-3 flex flex-wrap items-end gap-2 rounded-xl border border-border bg-surface p-4">
          <div>
            <label className="block text-xs font-medium text-foreground-soft">Name</label>
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="2027"
              className="mt-1 w-24 rounded-lg border border-border bg-background px-2 py-1.5 text-foreground outline-none focus:border-accent"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-foreground-soft">Start</label>
            <input
              required
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="mt-1 rounded-lg border border-border bg-background px-2 py-1.5 text-foreground outline-none focus:border-accent"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-foreground-soft">End</label>
            <input
              required
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="mt-1 rounded-lg border border-border bg-background px-2 py-1.5 text-foreground outline-none focus:border-accent"
            />
          </div>
          <button type="submit" className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white hover:opacity-90">
            Add year
          </button>
          {formError && <p className="w-full text-sm text-danger">{formError}</p>}
        </form>
      )}
    </section>
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

  async function onCreateClass(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    try {
      const created = await api.createClass(accessToken, schoolId, {
        divisionId,
        name,
        level: Number(level),
      });
      setClasses((prev) => [...prev, created]);
      setName("");
      setLevel("");
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Failed to create class");
    }
  }

  return (
    <section className="mt-8">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-foreground-soft">Classes &amp; sections</h2>

      <div className="mt-2 space-y-3">
        {classes.map((cls) => (
          <ClassRow key={cls.id} schoolId={schoolId} accessToken={accessToken} cls={cls} canManage={canManage} />
        ))}
        {classes.length === 0 && <p className="text-sm text-foreground-soft">No classes yet.</p>}
      </div>

      {canManage && divisions.length > 0 && (
        <form onSubmit={onCreateClass} className="mt-3 flex flex-wrap items-end gap-2 rounded-xl border border-border bg-surface p-4">
          <div>
            <label className="block text-xs font-medium text-foreground-soft">Division</label>
            <select
              value={divisionId}
              onChange={(e) => setDivisionId(e.target.value)}
              className="mt-1 rounded-lg border border-border bg-background px-2 py-1.5 text-foreground outline-none focus:border-accent"
            >
              {divisions.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.type}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-foreground-soft">Name</label>
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Class 7"
              className="mt-1 w-28 rounded-lg border border-border bg-background px-2 py-1.5 text-foreground outline-none focus:border-accent"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-foreground-soft">Level</label>
            <input
              required
              type="number"
              min={1}
              value={level}
              onChange={(e) => setLevel(e.target.value)}
              placeholder="7"
              className="mt-1 w-16 rounded-lg border border-border bg-background px-2 py-1.5 text-foreground outline-none focus:border-accent"
            />
          </div>
          <button type="submit" className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white hover:opacity-90">
            Add class
          </button>
          {formError && <p className="w-full text-sm text-danger">{formError}</p>}
        </form>
      )}
    </section>
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

  async function onCreateSection(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    try {
      const section = await api.createSection(accessToken, schoolId, cls.id, {
        name,
        capacity: Number(capacity),
      });
      setSections((prev) => [...prev, section]);
      setName("");
      setCapacity("");
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Failed to create section");
    }
  }

  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <p className="font-medium text-foreground">
        {cls.name} <span className="text-sm font-normal text-foreground-soft">· {cls.division.type}</span>
      </p>

      <div className="mt-2 flex flex-wrap gap-2">
        {sections.map((s) => (
          <span key={s.id} className="rounded-full bg-accent-soft px-3 py-1 text-sm text-accent">
            {s.name} · capacity {s.capacity}
          </span>
        ))}
        {sections.length === 0 && <span className="text-sm text-foreground-soft">No sections yet.</span>}
      </div>

      {canManage && (
        <form onSubmit={onCreateSection} className="mt-3 flex flex-wrap items-end gap-2">
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="A"
            className="w-16 rounded-lg border border-border bg-background px-2 py-1 text-sm text-foreground outline-none focus:border-accent"
          />
          <input
            required
            type="number"
            min={1}
            value={capacity}
            onChange={(e) => setCapacity(e.target.value)}
            placeholder="Capacity"
            className="w-24 rounded-lg border border-border bg-background px-2 py-1 text-sm text-foreground outline-none focus:border-accent"
          />
          <button type="submit" className="rounded-lg border border-border px-3 py-1 text-sm text-foreground hover:border-accent">
            Add section
          </button>
          {formError && <p className="w-full text-sm text-danger">{formError}</p>}
        </form>
      )}
    </div>
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

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    try {
      const subject = await api.createSubject(accessToken, schoolId, { name });
      setSubjects((prev) => [...prev, subject]);
      setName("");
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Failed to create subject");
    }
  }

  return (
    <section className="mt-8">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-foreground-soft">Subjects</h2>

      <div className="mt-2 flex flex-wrap gap-2">
        {subjects.map((s) => (
          <span key={s.id} className="rounded-full bg-surface border border-border px-3 py-1 text-sm text-foreground">
            {s.name}
          </span>
        ))}
        {subjects.length === 0 && <p className="text-sm text-foreground-soft">No subjects yet.</p>}
      </div>

      {canManage && (
        <form onSubmit={onCreate} className="mt-3 flex flex-wrap items-end gap-2">
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Mathematics"
            className="rounded-lg border border-border bg-background px-2 py-1.5 text-sm text-foreground outline-none focus:border-accent"
          />
          <button type="submit" className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white hover:opacity-90">
            Add subject
          </button>
          {formError && <p className="w-full text-sm text-danger">{formError}</p>}
        </form>
      )}
    </section>
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

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    try {
      const exam = await api.createExam(accessToken, schoolId, { name, type, academicYearId });
      setExams((prev) => [{ ...exam, examSubjects: [] }, ...prev]);
      setName("");
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Failed to create exam");
    }
  }

  return (
    <section className="mt-8">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-foreground-soft">Exams</h2>

      <div className="mt-2 space-y-3">
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
        {exams.length === 0 && <p className="text-sm text-foreground-soft">No exams yet.</p>}
      </div>

      {canManage && years.length > 0 && (
        <form onSubmit={onCreate} className="mt-3 flex flex-wrap items-end gap-2 rounded-xl border border-border bg-surface p-4">
          <div>
            <label className="block text-xs font-medium text-foreground-soft">Year</label>
            <select
              value={academicYearId}
              onChange={(e) => setAcademicYearId(e.target.value)}
              className="mt-1 rounded-lg border border-border bg-background px-2 py-1.5 text-foreground outline-none focus:border-accent"
            >
              {years.map((y) => (
                <option key={y.id} value={y.id}>
                  {y.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-foreground-soft">Name</label>
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Midterm 2027"
              className="mt-1 w-40 rounded-lg border border-border bg-background px-2 py-1.5 text-foreground outline-none focus:border-accent"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-foreground-soft">Type</label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as ExamType)}
              className="mt-1 rounded-lg border border-border bg-background px-2 py-1.5 text-foreground outline-none focus:border-accent"
            >
              <option value="QUIZ">Quiz</option>
              <option value="MIDTERM">Midterm</option>
              <option value="FINAL">Final</option>
              <option value="ASSIGNMENT">Assignment</option>
              <option value="OTHER">Other</option>
            </select>
          </div>
          <button type="submit" className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white hover:opacity-90">
            Add exam
          </button>
          {formError && <p className="w-full text-sm text-danger">{formError}</p>}
        </form>
      )}
    </section>
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

  async function onAddSubject(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    try {
      const examSubject = await api.createExamSubject(accessToken, schoolId, exam.id, {
        classId,
        subjectId,
        maxMarks: Number(maxMarks),
      });
      setExams((prev) =>
        prev.map((ex) => (ex.id === exam.id ? { ...ex, examSubjects: [...ex.examSubjects, examSubject] } : ex)),
      );
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Failed to add subject");
    }
  }

  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <p className="font-medium text-foreground">
        {exam.name} <span className="text-sm font-normal text-foreground-soft">· {exam.type}</span>
      </p>

      <div className="mt-2 flex flex-wrap gap-2">
        {exam.examSubjects.map((es) => (
          <span key={es.id} className="rounded-full bg-accent-soft px-3 py-1 text-sm text-accent">
            {es.class.name} · {es.subject.name} · /{es.maxMarks}
          </span>
        ))}
        {exam.examSubjects.length === 0 && <span className="text-sm text-foreground-soft">No subjects scheduled yet.</span>}
      </div>

      {canManage && classes.length > 0 && subjects.length > 0 && (
        <form onSubmit={onAddSubject} className="mt-3 flex flex-wrap items-end gap-2">
          <select
            value={classId}
            onChange={(e) => setClassId(e.target.value)}
            className="rounded-lg border border-border bg-background px-2 py-1 text-sm text-foreground outline-none focus:border-accent"
          >
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <select
            value={subjectId}
            onChange={(e) => setSubjectId(e.target.value)}
            className="rounded-lg border border-border bg-background px-2 py-1 text-sm text-foreground outline-none focus:border-accent"
          >
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <input
            type="number"
            min={1}
            value={maxMarks}
            onChange={(e) => setMaxMarks(e.target.value)}
            placeholder="Max marks"
            className="w-24 rounded-lg border border-border bg-background px-2 py-1 text-sm text-foreground outline-none focus:border-accent"
          />
          <button type="submit" className="rounded-lg border border-border px-3 py-1 text-sm text-foreground hover:border-accent">
            Add subject
          </button>
          {formError && <p className="w-full text-sm text-danger">{formError}</p>}
        </form>
      )}
    </div>
  );
}
