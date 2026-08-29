"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { ApiError, useAuth } from "@/lib/auth-context";
import { api, type AcademicYear, type ClassWithSections, type DuplicateCandidate, type GuardianInput, type Sex } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Alert } from "@/components/ui/Alert";
import { FieldGroup, FormField, Input, Select } from "@/components/ui/FormControls";
import { GuardianFieldSet, emptyGuardian } from "@/features/guardians/components/GuardianFieldSet";

export function StudentForm({ schoolId }: { schoolId: string }) {
  const router = useRouter();
  const { accessToken } = useAuth();

  const [classes, setClasses] = useState<ClassWithSections[]>([]);
  const [years, setYears] = useState<AcademicYear[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [sex, setSex] = useState<Sex>("MALE");
  const [classId, setClassId] = useState("");
  const [sectionId, setSectionId] = useState("");
  const [academicYearId, setAcademicYearId] = useState("");
  const [studentNumber, setStudentNumber] = useState("");
  const [rollNumber, setRollNumber] = useState("");

  const [guardians, setGuardians] = useState<GuardianInput[]>([]);

  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [duplicates, setDuplicates] = useState<DuplicateCandidate[] | null>(null);

  useEffect(() => {
    if (!accessToken) return;
    Promise.all([api.listClasses(accessToken, schoolId), api.listAcademicYears(accessToken, schoolId)])
      .then(([c, y]) => {
        setClasses(c);
        setYears(y);
        if (c[0]) setClassId(c[0].id);
        if (c[0]?.sections[0]) setSectionId(c[0].sections[0].id);
        const current = y.find((yr) => yr.isCurrent) ?? y[0];
        if (current) setAcademicYearId(current.id);
      })
      .catch((err) => setLoadError(err instanceof ApiError ? err.message : "Failed to load form data"));
  }, [accessToken, schoolId]);

  const selectedClass = classes.find((c) => c.id === classId);

  async function submit(confirmDespiteDuplicates: boolean) {
    if (!accessToken) return;
    setFormError(null);
    setSubmitting(true);
    try {
      const created = await api.createStudent(accessToken, schoolId, {
        firstName,
        lastName,
        dateOfBirth,
        sex,
        enrollment: {
          academicYearId,
          classId,
          sectionId,
          studentNumber: studentNumber || undefined,
          rollNumber: rollNumber ? Number(rollNumber) : undefined,
        },
        guardians: guardians.length > 0 ? guardians : undefined,
        confirmDespiteDuplicates,
      });
      router.push(`/schools/${schoolId}/students/${created.student.id}`);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409 && (err.body as { possibleDuplicates?: DuplicateCandidate[] })?.possibleDuplicates) {
        setDuplicates((err.body as { possibleDuplicates: DuplicateCandidate[] }).possibleDuplicates);
      } else {
        setFormError(err instanceof ApiError ? err.message : "Failed to create student");
      }
    } finally {
      setSubmitting(false);
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    submit(false);
  }

  if (loadError) return <Alert tone="danger">{loadError}</Alert>;

  if (duplicates) {
    return (
      <Card>
        <span className="text-xs font-semibold uppercase tracking-wide text-warning">Possible duplicate</span>
        <h2 className="mt-1 text-lg font-semibold text-foreground">
          {duplicates.length} similar student{duplicates.length > 1 ? "s" : ""} already exist
        </h2>
        <p className="mt-2 text-sm text-foreground-soft">
          Same last name and date of birth as someone already in the system. Review before continuing — this is
          never merged automatically.
        </p>

        <ul className="mt-4 space-y-2">
          {duplicates.map((d) => (
            <li key={d.id} className="rounded-xl border border-border bg-surface-soft p-4">
              <p className="font-medium text-foreground">
                {d.firstName} {d.lastName}
              </p>
              <p className="text-sm text-foreground-soft">Born {new Date(d.dateOfBirth).toLocaleDateString()}</p>
            </li>
          ))}
        </ul>

        <div className="mt-6 flex flex-wrap gap-3">
          <Button variant="outline" onClick={() => setDuplicates(null)}>
            Go back and check
          </Button>
          <Button variant="danger" loading={submitting} onClick={() => submit(true)}>
            This is a different person — create anyway
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <Card>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-foreground-muted">Personal information</h2>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField label="First name" required>
            <Input required value={firstName} onChange={(e) => setFirstName(e.target.value)} />
          </FormField>
          <FormField label="Last name" required>
            <Input required value={lastName} onChange={(e) => setLastName(e.target.value)} />
          </FormField>
          <FormField label="Date of birth" required>
            <Input required type="date" value={dateOfBirth} onChange={(e) => setDateOfBirth(e.target.value)} />
          </FormField>
          <FormField label="Sex" required>
            <Select value={sex} onChange={(e) => setSex(e.target.value as Sex)}>
              <option value="MALE">Male</option>
              <option value="FEMALE">Female</option>
            </Select>
          </FormField>
        </div>

        <FieldGroup legend="Enrollment">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <FormField label="Academic year" required>
              <Select required value={academicYearId} onChange={(e) => setAcademicYearId(e.target.value)}>
                {years.map((y) => (
                  <option key={y.id} value={y.id}>
                    {y.name}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label="Class" required>
              <Select
                required
                value={classId}
                onChange={(e) => {
                  setClassId(e.target.value);
                  const c = classes.find((cl) => cl.id === e.target.value);
                  setSectionId(c?.sections[0]?.id ?? "");
                }}
              >
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label="Section" required>
              <Select required value={sectionId} onChange={(e) => setSectionId(e.target.value)}>
                {selectedClass?.sections.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} (cap. {s.capacity})
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label="Student / admission number" hint="Leave blank to auto-generate.">
              <Input value={studentNumber} onChange={(e) => setStudentNumber(e.target.value)} />
            </FormField>
            <FormField label="Roll number" hint="Leave blank to auto-assign.">
              <Input type="number" min={1} value={rollNumber} onChange={(e) => setRollNumber(e.target.value)} />
            </FormField>
          </div>
        </FieldGroup>

        <FieldGroup legend="Guardian / parent (optional)">
          <p className="mb-3 -mt-1 text-xs text-foreground-muted">
            Matched by phone or email — an existing guardian is linked instead of duplicated if either matches.
            Guardian contact details also serve as this student&apos;s emergency contact.
          </p>
          <div className="space-y-4">
            {guardians.map((g, i) => (
              <div key={i} className="relative rounded-xl border border-border bg-surface-soft p-4">
                <GuardianFieldSet value={g} onChange={(next) => setGuardians((prev) => prev.map((p, idx) => (idx === i ? next : p)))} />
                <button
                  type="button"
                  onClick={() => setGuardians((prev) => prev.filter((_, idx) => idx !== i))}
                  className="absolute right-3 top-3 rounded-lg p-1.5 text-foreground-muted hover:bg-danger-soft hover:text-danger"
                  aria-label="Remove guardian"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            ))}
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            icon={<Plus className="size-4" />}
            className="mt-3"
            onClick={() => setGuardians((prev) => [...prev, emptyGuardian()])}
          >
            Add guardian
          </Button>
        </FieldGroup>
      </Card>

      {formError && <Alert tone="danger">{formError}</Alert>}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={() => router.back()}>
          Cancel
        </Button>
        <Button type="submit" loading={submitting}>
          Create student
        </Button>
      </div>
    </form>
  );
}
