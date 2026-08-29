"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { ApiError, useAuth } from "@/lib/auth-context";
import { api, type AcademicYear, type ClassWithSections, type Subject } from "@/lib/api";
import { teachersApi } from "../api";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Alert } from "@/components/ui/Alert";
import { FieldGroup, FormField, Input, Select } from "@/components/ui/FormControls";
import { useToast } from "@/components/ui/Toast";

interface AssignmentRow {
  academicYearId: string;
  classId: string;
  sectionId: string;
  subjectId: string;
}

export function TeacherForm({ schoolId, onCreated }: { schoolId: string; onCreated?: () => void }) {
  const router = useRouter();
  const { accessToken } = useAuth();
  const { show } = useToast();

  const [years, setYears] = useState<AcademicYear[]>([]);
  const [classes, setClasses] = useState<ClassWithSections[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [employeeNumber, setEmployeeNumber] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [qualification, setQualification] = useState("");
  const [assignments, setAssignments] = useState<AssignmentRow[]>([]);

  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!accessToken) return;
    Promise.all([
      api.listAcademicYears(accessToken, schoolId),
      api.listClasses(accessToken, schoolId),
      api.listSubjects(accessToken, schoolId),
    ])
      .then(([y, c, s]) => {
        setYears(y);
        setClasses(c);
        setSubjects(s);
      })
      .catch((err) => setLoadError(err instanceof ApiError ? err.message : "Failed to load form data"));
  }, [accessToken, schoolId]);

  function addAssignmentRow() {
    const currentYear = years.find((y) => y.isCurrent) ?? years[0];
    const firstClass = classes[0];
    setAssignments((prev) => [
      ...prev,
      {
        academicYearId: currentYear?.id ?? "",
        classId: firstClass?.id ?? "",
        sectionId: firstClass?.sections[0]?.id ?? "",
        subjectId: subjects[0]?.id ?? "",
      },
    ]);
  }

  function updateAssignment(i: number, patch: Partial<AssignmentRow>) {
    setAssignments((prev) => prev.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!accessToken) return;
    setFormError(null);
    setSubmitting(true);
    try {
      await teachersApi.create(accessToken, schoolId, {
        firstName,
        lastName,
        employeeNumber,
        phone: phone || undefined,
        email: email || undefined,
        qualification: qualification || undefined,
        assignments: assignments.length
          ? assignments.map((a) => ({ academicYearId: a.academicYearId, sectionId: a.sectionId, subjectId: a.subjectId }))
          : undefined,
      });
      show(`${firstName} ${lastName} added.`);
      if (onCreated) onCreated();
      else router.push(`/schools/${schoolId}/teachers`);
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Failed to create teacher");
    } finally {
      setSubmitting(false);
    }
  }

  if (loadError) return <Alert tone="danger">{loadError}</Alert>;

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
          <FormField label="Employee / staff number" required>
            <Input required value={employeeNumber} onChange={(e) => setEmployeeNumber(e.target.value)} />
          </FormField>
          <FormField label="Qualification">
            <Input value={qualification} onChange={(e) => setQualification(e.target.value)} placeholder="B.Ed, M.Sc…" />
          </FormField>
          <FormField label="Phone">
            <Input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </FormField>
          <FormField label="Email" hint="Needed later to invite this teacher to log in.">
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </FormField>
        </div>

        {years.length > 0 && classes.length > 0 && subjects.length > 0 && (
          <FieldGroup legend="Class & subject assignments (optional)">
            <div className="space-y-3">
              {assignments.map((row, i) => {
                const cls = classes.find((c) => c.id === row.classId);
                return (
                  <div key={i} className="relative grid grid-cols-2 gap-2 rounded-xl border border-border bg-surface-soft p-3 sm:grid-cols-4">
                    <Select value={row.academicYearId} onChange={(e) => updateAssignment(i, { academicYearId: e.target.value })}>
                      {years.map((y) => (
                        <option key={y.id} value={y.id}>
                          {y.name}
                        </option>
                      ))}
                    </Select>
                    <Select
                      value={row.classId}
                      onChange={(e) => {
                        const c = classes.find((cl) => cl.id === e.target.value);
                        updateAssignment(i, { classId: e.target.value, sectionId: c?.sections[0]?.id ?? "" });
                      }}
                    >
                      {classes.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </Select>
                    <Select value={row.sectionId} onChange={(e) => updateAssignment(i, { sectionId: e.target.value })}>
                      {cls?.sections.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </Select>
                    <div className="flex gap-1">
                      <Select
                        value={row.subjectId}
                        onChange={(e) => updateAssignment(i, { subjectId: e.target.value })}
                        className="flex-1"
                      >
                        {subjects.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                      </Select>
                      <button
                        type="button"
                        onClick={() => setAssignments((prev) => prev.filter((_, idx) => idx !== i))}
                        className="shrink-0 rounded-lg p-2 text-foreground-muted hover:bg-danger-soft hover:text-danger"
                        aria-label="Remove assignment"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
            <Button type="button" variant="outline" size="sm" icon={<Plus className="size-4" />} className="mt-3" onClick={addAssignmentRow}>
              Add assignment
            </Button>
          </FieldGroup>
        )}
      </Card>

      {formError && <Alert tone="danger">{formError}</Alert>}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={() => router.back()}>
          Cancel
        </Button>
        <Button type="submit" loading={submitting}>
          Create teacher
        </Button>
      </div>
    </form>
  );
}
