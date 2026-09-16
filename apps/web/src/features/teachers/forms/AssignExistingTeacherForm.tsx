"use client";

import { useEffect, useState } from "react";
import { Search, UserPlus } from "lucide-react";
import { api, type AcademicYear, type ClassWithSections, type Teacher, type TeacherSearchResult } from "@/lib/api";
import { ApiError } from "@/lib/auth-context";
import { teachersApi } from "../api";
import { ClassSubjectChecklist } from "../teacher-details/AssignmentsManager";
import { SchoolTypeBadge } from "@/features/my-classes/components/SchoolTypeBadge";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { FormField, Input, Select } from "@/components/ui/FormControls";

// Search-existing-teacher-across-the-org first, same duplicate-prevention
// shape already proven for parents/guardians (see GuardianForm) — a
// teacher's Teacher row lives at one home school (Teacher.userId is
// unique), so this is the only correct way to have them also teach at a
// second school. "Add teacher" (TeacherWizard) always creates a brand-new
// person and must never be used for someone who already has a profile
// elsewhere in the organization.
export function AssignExistingTeacherForm({
  accessToken,
  schoolId,
  onAssigned,
  onCancel,
}: {
  accessToken: string;
  schoolId: string;
  onAssigned: (teacherId: string) => void;
  onCancel: () => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<TeacherSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<TeacherSearchResult | null>(null);

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }
    const handle = setTimeout(() => {
      setSearching(true);
      api
        .searchTeachers(accessToken, schoolId, query)
        .then(setResults)
        .catch(() => setResults([]))
        .finally(() => setSearching(false));
    }, 300);
    return () => clearTimeout(handle);
  }, [accessToken, schoolId, query]);

  if (selected) {
    return (
      <AssignPicker
        accessToken={accessToken}
        schoolId={schoolId}
        teacher={selected}
        onAssigned={onAssigned}
        onBack={() => setSelected(null)}
      />
    );
  }

  const searched = query.trim().length >= 2;

  return (
    <div className="rounded-xl border border-border bg-surface-soft p-4">
      <h3 className="text-sm font-semibold text-foreground">Assign existing teacher</h3>
      <p className="mt-0.5 text-xs text-foreground-soft">
        Search across the whole organization — for a teacher who already teaches at another school.
      </p>
      <div className="relative mt-2">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-foreground-muted" />
        <Input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name, employee number, or email…"
          className="pl-9"
        />
      </div>

      {searched && (
        <div className="mt-3 space-y-1.5">
          {searching ? (
            <p className="px-1 py-2 text-sm text-foreground-muted">Searching…</p>
          ) : results.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border p-4 text-center">
              <p className="text-sm text-foreground-muted">No matching teacher found in this organization.</p>
              <p className="mt-1 text-xs text-foreground-muted">
                If this is a brand-new person, use "Add teacher" instead.
              </p>
            </div>
          ) : (
            results.map((r) => (
              <div key={r.id} className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background p-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium text-foreground">
                      {r.firstName} {r.lastName}
                    </p>
                    {r.teacherCode && (
                      <span className="font-mono text-xs font-medium text-accent">{r.teacherCode}</span>
                    )}
                    <SchoolTypeBadge type={r.school.type} />
                  </div>
                  <p className="truncate text-sm text-foreground-soft">{r.school.name}</p>
                </div>
                <Button size="sm" variant="outline" icon={<UserPlus className="size-4" />} onClick={() => setSelected(r)}>
                  Select
                </Button>
              </div>
            ))
          )}
        </div>
      )}

      <div className="mt-4">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

function AssignPicker({
  accessToken,
  schoolId,
  teacher,
  onAssigned,
  onBack,
}: {
  accessToken: string;
  schoolId: string;
  teacher: TeacherSearchResult;
  onAssigned: (teacherId: string) => void;
  onBack: () => void;
}) {
  const [years, setYears] = useState<AcademicYear[]>([]);
  const [classes, setClasses] = useState<ClassWithSections[]>([]);
  // Every teacher already assigned at THIS school — used only to keep a
  // subject/section from being offered to two teachers at once. Never
  // shows this candidate's assignments at their other school(s); those
  // simply aren't fetched here.
  const [allTeachers, setAllTeachers] = useState<Teacher[]>([]);
  const [academicYearId, setAcademicYearId] = useState("");
  const [classId, setClassId] = useState("");
  const [sectionId, setSectionId] = useState("");
  const [subjectIds, setSubjectIds] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([api.listAcademicYears(accessToken, schoolId), api.listClasses(accessToken, schoolId), teachersApi.list(accessToken, schoolId)]).then(
      ([y, c, t]) => {
        setYears(y);
        setClasses(c);
        setAllTeachers(t);
      },
    );
  }, [accessToken, schoolId]);

  const selectedClass = classes.find((c) => c.id === classId);

  function onYearChange(newYearId: string) {
    setAcademicYearId(newYearId);
    setClassId("");
    setSectionId("");
    setSubjectIds(new Set());
  }

  function onClassChange(newClassId: string) {
    setClassId(newClassId);
    setSectionId("");
    setSubjectIds(new Set());
  }

  function onSectionChange(newSectionId: string) {
    setSectionId(newSectionId);
    setSubjectIds(new Set());
  }

  function toggleSubject(subjectId: string, checked: boolean) {
    const next = new Set(subjectIds);
    if (checked) next.add(subjectId);
    else next.delete(subjectId);
    setSubjectIds(next);
  }

  const takenSubjectIds = new Set(
    allTeachers
      .flatMap((t) => t.assignments)
      .filter((a) => a.academicYearId === academicYearId && a.section.id === sectionId)
      .map((a) => a.subject.id),
  );

  async function onSubmit() {
    if (!academicYearId || !classId || !sectionId || subjectIds.size === 0) return;
    setSubmitting(true);
    setError(null);
    try {
      const results = await Promise.allSettled(
        Array.from(subjectIds).map((subjectId) =>
          teachersApi.addAssignment(accessToken, schoolId, teacher.id, { academicYearId, sectionId, subjectId }),
        ),
      );
      const failed = results.filter((r) => r.status === "rejected").length;
      if (failed === results.length) {
        const firstError = results.find((r): r is PromiseRejectedResult => r.status === "rejected")?.reason;
        setError(firstError instanceof ApiError ? firstError.message : "Failed to assign this teacher");
        return;
      }
      onAssigned(teacher.id);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="rounded-xl border border-border bg-surface-soft p-4">
      <h3 className="text-sm font-semibold text-foreground">
        Assign {teacher.firstName} {teacher.lastName} to a class here
      </h3>
      <div className="mt-2 flex items-center gap-2 rounded-lg border border-accent bg-accent-soft px-3 py-2">
        <p className="text-sm font-medium text-foreground">
          {teacher.firstName} {teacher.lastName}
        </p>
        {teacher.teacherCode && <span className="font-mono text-xs font-medium text-accent">{teacher.teacherCode}</span>}
        <SchoolTypeBadge type={teacher.school.type} />
        <p className="text-xs text-foreground-soft">home school: {teacher.school.name}</p>
      </div>

      <div className="mt-3 flex flex-wrap items-end gap-2">
        <FormField label="Academic year" required className="w-auto">
          <Select value={academicYearId} onChange={(e) => onYearChange(e.target.value)} className="w-auto">
            <option value="">Select academic year</option>
            {years.map((y) => (
              <option key={y.id} value={y.id}>
                {y.name}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label="Class" required className="w-auto">
          <Select value={classId} onChange={(e) => onClassChange(e.target.value)} disabled={!academicYearId} className="w-auto">
            <option value="">Select class</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label="Section" required className="w-auto">
          <Select value={sectionId} onChange={(e) => onSectionChange(e.target.value)} disabled={!classId} className="w-auto">
            <option value="">Select section</option>
            {(selectedClass?.sections ?? []).map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </FormField>
      </div>

      {classId && (
        <div className="mt-3">
          <ClassSubjectChecklist
            key={classId}
            accessToken={accessToken}
            schoolId={schoolId}
            classId={classId}
            selected={subjectIds}
            taken={takenSubjectIds}
            onToggle={toggleSubject}
          />
        </div>
      )}

      {error && (
        <Alert tone="danger" className="mt-3">
          {error}
        </Alert>
      )}

      <div className="mt-4 flex items-center gap-2">
        <Button
          size="sm"
          icon={<UserPlus className="size-4" />}
          loading={submitting}
          disabled={!academicYearId || !classId || !sectionId || subjectIds.size === 0}
          onClick={onSubmit}
        >
          {subjectIds.size > 0 ? `Assign ${subjectIds.size} subject${subjectIds.size === 1 ? "" : "s"}` : "Assign"}
        </Button>
        <Button size="sm" variant="outline" onClick={onBack}>
          Back to search
        </Button>
      </div>
    </div>
  );
}
