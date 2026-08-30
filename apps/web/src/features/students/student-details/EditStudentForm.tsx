"use client";

import { useEffect, useState, type FormEvent } from "react";
import { api, type AcademicYear, type ClassWithSections, type StudentDetail, type UpdateStudentInput } from "@/lib/api";
import { ApiError } from "@/lib/auth-context";
import { studentsApi } from "../api";
import { Card, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { FieldGroup, FormField, Input, Select } from "@/components/ui/FormControls";
import { useToast } from "@/components/ui/Toast";

// Enrollment (class/section/roll number) is edited here too, alongside the
// student's profile fields — this is a direct correction of the CURRENT
// active enrollment row, not a new enrollment period. It intentionally does
// NOT go through the promotion/transfer flows: those end the old enrollment
// and create a new one (a real academic transition, with its own history
// record); this just fixes the existing row in place. See
// StudentsService.update / updateActiveEnrollment on the backend.
export function EditStudentForm({
  accessToken,
  student,
  schoolId,
  onCancel,
  onSaved,
}: {
  accessToken: string;
  student: StudentDetail;
  schoolId: string;
  onCancel: () => void;
  onSaved: (student: StudentDetail) => void;
}) {
  const { show } = useToast();
  const activeEnrollment = student.enrollments.find((e) => e.status === "ACTIVE");

  const [form, setForm] = useState<UpdateStudentInput>({
    firstName: student.firstName,
    lastName: student.lastName,
    dateOfBirth: student.dateOfBirth.slice(0, 10),
    sex: student.sex,
    legacyStudentNumber: student.legacyStudentNumber ?? "",
  });

  const [years, setYears] = useState<AcademicYear[]>([]);
  const [classes, setClasses] = useState<ClassWithSections[]>([]);
  const [academicYearId, setAcademicYearId] = useState(activeEnrollment?.academicYear.id ?? "");
  const [classId, setClassId] = useState(activeEnrollment?.class.id ?? "");
  const [sectionId, setSectionId] = useState(activeEnrollment?.section.id ?? "");
  const [rollNumber, setRollNumber] = useState(activeEnrollment ? String(activeEnrollment.rollNumber) : "");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!activeEnrollment) return;
    Promise.all([api.listAcademicYears(accessToken, schoolId), api.listClasses(accessToken, schoolId)]).then(
      ([y, c]) => {
        setYears(y);
        setClasses(c);
      },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken, schoolId]);

  const selectedClass = classes.find((c) => c.id === classId);
  const enrollmentValid = !activeEnrollment || (!!academicYearId && !!classId && !!sectionId && Number(rollNumber) >= 1);

  function patch(p: Partial<UpdateStudentInput>) {
    setForm((prev) => ({ ...prev, ...p }));
  }

  function onYearChange(newYearId: string) {
    setAcademicYearId(newYearId);
    setClassId("");
    setSectionId("");
  }

  function onClassChange(newClassId: string) {
    setClassId(newClassId);
    setSectionId("");
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!enrollmentValid) return;
    setError(null);
    setSaving(true);
    try {
      const updated = await studentsApi.update(accessToken, student.id, {
        ...form,
        legacyStudentNumber: form.legacyStudentNumber || undefined,
        enrollment: activeEnrollment
          ? { academicYearId, classId, sectionId, rollNumber: Number(rollNumber) }
          : undefined,
      });
      show("Student profile updated.");
      onSaved(updated);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to update student");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card padding="none">
      <CardHeader title="Edit student" description="Profile details and current enrollment." />
      <form onSubmit={onSubmit} className="space-y-5 p-5">
        <FieldGroup legend="Student information">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField label="First name" required>
              <Input required value={form.firstName ?? ""} onChange={(e) => patch({ firstName: e.target.value })} />
            </FormField>
            <FormField label="Last name" required>
              <Input required value={form.lastName ?? ""} onChange={(e) => patch({ lastName: e.target.value })} />
            </FormField>
            <FormField label="Date of birth" required>
              <Input
                type="date"
                required
                value={form.dateOfBirth ?? ""}
                onChange={(e) => patch({ dateOfBirth: e.target.value })}
              />
            </FormField>
            <FormField label="Gender">
              <Select value={form.sex ?? ""} onChange={(e) => patch({ sex: e.target.value as UpdateStudentInput["sex"] })}>
                <option value="MALE">Male</option>
                <option value="FEMALE">Female</option>
              </Select>
            </FormField>
            <FormField label="Legacy student number" className="sm:col-span-2">
              <Input
                value={form.legacyStudentNumber ?? ""}
                onChange={(e) => patch({ legacyStudentNumber: e.target.value })}
              />
            </FormField>
          </div>
        </FieldGroup>

        {activeEnrollment && (
          <FieldGroup legend="Current enrollment">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <FormField label="Academic year" required>
                <Select value={academicYearId} onChange={(e) => onYearChange(e.target.value)}>
                  <option value="">Select academic year</option>
                  {years.map((y) => (
                    <option key={y.id} value={y.id}>
                      {y.name}
                    </option>
                  ))}
                </Select>
              </FormField>
              <FormField label="Class" required>
                <Select value={classId} onChange={(e) => onClassChange(e.target.value)} disabled={!academicYearId}>
                  <option value="">Select class</option>
                  {classes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </FormField>
              <FormField label="Section" required>
                <Select value={sectionId} onChange={(e) => setSectionId(e.target.value)} disabled={!classId}>
                  <option value="">Select section</option>
                  {(selectedClass?.sections ?? []).map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </Select>
              </FormField>
              <FormField label="Roll number" required>
                <Input
                  type="number"
                  min={1}
                  required
                  value={rollNumber}
                  onChange={(e) => setRollNumber(e.target.value)}
                />
              </FormField>
            </div>
          </FieldGroup>
        )}

        {error && <Alert tone="danger">{error}</Alert>}

        <div className="flex gap-2">
          <Button type="submit" size="sm" loading={saving} disabled={!enrollmentValid}>
            Save changes
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </form>
    </Card>
  );
}
