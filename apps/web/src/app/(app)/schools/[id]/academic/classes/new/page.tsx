"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useAuth, ApiError } from "@/lib/auth-context";
import { api, type AcademicYear, type ClassWithSections, type Division, type Subject } from "@/lib/api";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { FormField, Input, Select } from "@/components/ui/FormControls";
import { SkeletonCards } from "@/components/ui/Skeleton";
import { CheckCircle2, Plus, X } from "lucide-react";

// One workflow: Academic Year + Class + every Section + every Subject,
// saved together in a single request (ClassesService.create wraps it all
// in one transaction) — no "create class, then hunt down another page to
// add sections/subjects" round trip.
export default function CreateClassPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: schoolId } = use(params);
  const { accessToken } = useAuth();

  const [divisions, setDivisions] = useState<Division[] | null>(null);
  const [years, setYears] = useState<AcademicYear[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken) return;
    Promise.all([api.listDivisions(accessToken, schoolId), api.listAcademicYears(accessToken, schoolId), api.listSubjects(accessToken, schoolId)])
      .then(([d, y, s]) => {
        setDivisions(d);
        setYears(y);
        setSubjects(s);
      })
      .catch((err) => setLoadError(err instanceof ApiError ? err.message : "Failed to load academic structure"));
  }, [accessToken, schoolId]);

  if (loadError) {
    return (
      <div className="p-4 sm:p-6">
        <Alert tone="danger">{loadError}</Alert>
      </div>
    );
  }
  if (!divisions || !accessToken) return <SkeletonCards count={3} />;

  return (
    <ClassWizard
      schoolId={schoolId}
      accessToken={accessToken}
      divisions={divisions}
      years={years}
      onYearsChange={setYears}
      subjects={subjects}
      onSubjectsChange={setSubjects}
    />
  );
}

function ClassWizard({
  schoolId,
  accessToken,
  divisions,
  years,
  onYearsChange,
  subjects,
  onSubjectsChange,
}: {
  schoolId: string;
  accessToken: string;
  divisions: Division[];
  years: AcademicYear[];
  onYearsChange: (years: AcademicYear[]) => void;
  subjects: Subject[];
  onSubjectsChange: (subjects: Subject[]) => void;
}) {
  const currentYear = years.find((y) => y.isCurrent) ?? years[0];

  const [academicYearId, setAcademicYearId] = useState(currentYear?.id ?? "");
  const [addingYear, setAddingYear] = useState(years.length === 0);
  const [newYearName, setNewYearName] = useState("");
  const [newYearStart, setNewYearStart] = useState("");
  const [newYearEnd, setNewYearEnd] = useState("");
  const [yearError, setYearError] = useState<string | null>(null);
  const [savingYear, setSavingYear] = useState(false);

  const [divisionId, setDivisionId] = useState(divisions[0]?.id ?? "");
  const [className, setClassName] = useState("");
  const [level, setLevel] = useState("");
  const [sectionNames, setSectionNames] = useState<string[]>([""]);
  const [selectedSubjectIds, setSelectedSubjectIds] = useState<Set<string>>(new Set());
  const [newSubjectName, setNewSubjectName] = useState("");
  const [addingSubject, setAddingSubject] = useState(false);

  const [errors, setErrors] = useState<string[]>([]);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [created, setCreated] = useState<ClassWithSections | null>(null);

  const selectedYear = years.find((y) => y.id === academicYearId) ?? null;

  async function onCreateYear() {
    setYearError(null);
    if (!newYearName || !newYearStart || !newYearEnd) {
      setYearError("Name, start, and end date are all required.");
      return;
    }
    setSavingYear(true);
    try {
      const year = await api.createAcademicYear(accessToken, schoolId, {
        name: newYearName,
        startDate: newYearStart,
        endDate: newYearEnd,
      });
      onYearsChange([year, ...years]);
      setAcademicYearId(year.id);
      setAddingYear(false);
      setNewYearName("");
      setNewYearStart("");
      setNewYearEnd("");
    } catch (err) {
      setYearError(err instanceof ApiError ? err.message : "Failed to create academic year");
    } finally {
      setSavingYear(false);
    }
  }

  async function onCreateSubject() {
    if (!newSubjectName.trim()) return;
    setAddingSubject(true);
    try {
      const subject = await api.createSubject(accessToken, schoolId, { name: newSubjectName.trim() });
      onSubjectsChange([...subjects, subject]);
      setSelectedSubjectIds((prev) => new Set(prev).add(subject.id));
      setNewSubjectName("");
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : "Failed to add subject");
    } finally {
      setAddingSubject(false);
    }
  }

  function toggleSubject(id: string) {
    setSelectedSubjectIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function updateSectionName(index: number, value: string) {
    setSectionNames((prev) => prev.map((n, i) => (i === index ? value : n)));
  }

  function removeSection(index: number) {
    setSectionNames((prev) => prev.filter((_, i) => i !== index));
  }

  function resetForNextClass() {
    setClassName("");
    setLevel("");
    setSectionNames([""]);
    setSelectedSubjectIds(new Set());
    setErrors([]);
    setSaveError(null);
    setCreated(null);
  }

  async function onSave() {
    const cleanedSections = sectionNames.map((n) => n.trim()).filter(Boolean);
    const problems: string[] = [];
    if (!academicYearId) problems.push("Select an academic year.");
    if (!divisionId) problems.push("Select a division.");
    if (!className.trim()) problems.push("Class name is required.");
    if (!level || Number(level) < 1) problems.push("Level must be a positive number.");
    if (cleanedSections.length === 0) problems.push("Add at least one section.");
    const dupeSection = cleanedSections.find((n, i) => cleanedSections.findIndex((n2) => n2.toLowerCase() === n.toLowerCase()) !== i);
    if (dupeSection) problems.push(`Duplicate section name: ${dupeSection}`);
    if (selectedSubjectIds.size === 0) problems.push("Select at least one subject.");

    setErrors(problems);
    if (problems.length > 0) return;

    setSaving(true);
    setSaveError(null);
    try {
      const cls = await api.createClass(accessToken, schoolId, {
        divisionId,
        name: className.trim(),
        level: Number(level),
        sections: cleanedSections.map((name) => ({ name })),
        subjectIds: Array.from(selectedSubjectIds),
      });
      setCreated(cls);
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : "Failed to create class");
    } finally {
      setSaving(false);
    }
  }

  if (created) {
    return (
      <div>
        <PageHeader
          eyebrow="Academic"
          title="Create class"
          breadcrumbs={[
            { label: "Dashboard", href: `/schools/${schoolId}/dashboard` },
            { label: "Academic", href: `/schools/${schoolId}/academic` },
            { label: "Create class" },
          ]}
        />
        <div className="mx-auto max-w-lg space-y-4 p-4 sm:p-6">
          <Card className="text-center">
            <CheckCircle2 className="mx-auto size-10 text-success" />
            <p className="mt-3 text-lg font-semibold text-foreground">{created.name} created successfully.</p>
            <p className="mt-1 text-sm text-foreground-soft">
              {created.sections.length} section{created.sections.length === 1 ? "" : "s"} · {created._count.classSubjects} subject
              {created._count.classSubjects === 1 ? "" : "s"}
            </p>
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              <Button icon={<Plus className="size-4" />} onClick={resetForNextClass}>
                Create another class
              </Button>
              <Link href={`/schools/${schoolId}/academic`}>
                <Button variant="outline">Back to Classes</Button>
              </Link>
            </div>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        eyebrow="Academic"
        title="Create class"
        description="Academic year, sections, and subjects — all in one place."
        breadcrumbs={[
          { label: "Dashboard", href: `/schools/${schoolId}/dashboard` },
          { label: "Academic", href: `/schools/${schoolId}/academic` },
          { label: "Create class" },
        ]}
      />

      <div className="mx-auto max-w-2xl space-y-5 p-4 sm:p-6">
        <Card padding="none">
          <CardHeader title="Academic year" description="Which year is this class being set up for?" />
          <div className="space-y-3 p-5">
            {years.length === 0 || addingYear ? (
              <div className="space-y-3">
                {years.length > 0 && (
                  <button type="button" onClick={() => setAddingYear(false)} className="text-sm text-accent hover:underline">
                    ← Choose an existing year instead
                  </button>
                )}
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <FormField label="Name" required>
                    <Input value={newYearName} onChange={(e) => setNewYearName(e.target.value)} placeholder="2027" />
                  </FormField>
                  <FormField label="Start Date" required>
                    <Input type="date" value={newYearStart} onChange={(e) => setNewYearStart(e.target.value)} />
                  </FormField>
                  <FormField label="End Date" required>
                    <Input type="date" value={newYearEnd} onChange={(e) => setNewYearEnd(e.target.value)} />
                  </FormField>
                </div>
                {yearError && <Alert tone="danger">{yearError}</Alert>}
                <Button size="sm" loading={savingYear} onClick={onCreateYear}>
                  Save academic year
                </Button>
              </div>
            ) : (
              <>
                <FormField label="Academic Year" required>
                  <Select value={academicYearId} onChange={(e) => setAcademicYearId(e.target.value)}>
                    {years.map((y) => (
                      <option key={y.id} value={y.id}>
                        {y.name}
                        {y.isCurrent ? " (current)" : ""}
                      </option>
                    ))}
                  </Select>
                </FormField>
                {selectedYear && (
                  <p className="text-sm text-foreground-soft">
                    Runs {new Date(selectedYear.startDate).toLocaleDateString()} – {new Date(selectedYear.endDate).toLocaleDateString()}
                  </p>
                )}
                <button type="button" onClick={() => setAddingYear(true)} className="text-sm text-accent hover:underline">
                  + Add a new academic year
                </button>
              </>
            )}
          </div>
        </Card>

        <Card padding="none">
          <CardHeader title="Class details" />
          <div className="grid grid-cols-1 gap-3 p-5 sm:grid-cols-2">
            <FormField label="Class Name" required>
              <Input value={className} onChange={(e) => setClassName(e.target.value)} placeholder="Form 1" />
            </FormField>
            <FormField label="Division" required>
              <Select value={divisionId} onChange={(e) => setDivisionId(e.target.value)}>
                {divisions.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.type}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label="Level" hint="Used for ordering and promotions." required>
              <Input type="number" min={1} value={level} onChange={(e) => setLevel(e.target.value)} placeholder="7" />
            </FormField>
          </div>
        </Card>

        <Card padding="none">
          <CardHeader title="Sections" description="Capacity is unlimited — add as many sections as you need." />
          <div className="space-y-2 p-5">
            {sectionNames.map((name, i) => (
              <div key={i} className="flex items-center gap-2">
                <Input
                  value={name}
                  onChange={(e) => updateSectionName(i, e.target.value)}
                  placeholder={String.fromCharCode(65 + i)}
                  className="max-w-[160px]"
                />
                {sectionNames.length > 1 && (
                  <Button type="button" size="sm" variant="ghost" icon={<X className="size-4" />} onClick={() => removeSection(i)}>
                    Remove
                  </Button>
                )}
              </div>
            ))}
            <Button
              type="button"
              size="sm"
              variant="outline"
              icon={<Plus className="size-4" />}
              onClick={() => setSectionNames((prev) => [...prev, ""])}
            >
              Add Section
            </Button>
          </div>
        </Card>

        <Card padding="none">
          <CardHeader title="Subjects" description="Select every subject taught in this class." />
          <div className="space-y-3 p-5">
            {subjects.length === 0 ? (
              <p className="text-sm text-foreground-muted">No subjects created yet — add one below.</p>
            ) : (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {subjects.map((s) => (
                  <label key={s.id} className="flex items-center gap-2 text-sm text-foreground">
                    <input
                      type="checkbox"
                      checked={selectedSubjectIds.has(s.id)}
                      onChange={() => toggleSubject(s.id)}
                      className="size-4 rounded border-border text-accent focus:ring-accent"
                    />
                    {s.name}
                  </label>
                ))}
              </div>
            )}
            <div className="flex items-center gap-2 border-t border-border pt-3">
              <Input
                value={newSubjectName}
                onChange={(e) => setNewSubjectName(e.target.value)}
                placeholder="New subject name"
                className="max-w-[220px]"
              />
              <Button type="button" size="sm" variant="outline" loading={addingSubject} icon={<Plus className="size-4" />} onClick={onCreateSubject}>
                Add Subject
              </Button>
            </div>
          </div>
        </Card>

        {errors.length > 0 && (
          <Alert tone="danger">
            <ul className="list-inside list-disc">
              {errors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          </Alert>
        )}
        {saveError && <Alert tone="danger">{saveError}</Alert>}

        <div className="flex justify-end gap-2">
          <Link href={`/schools/${schoolId}/academic`}>
            <Button variant="outline">Cancel</Button>
          </Link>
          <Button loading={saving} onClick={onSave}>
            Save class
          </Button>
        </div>
      </div>
    </div>
  );
}
