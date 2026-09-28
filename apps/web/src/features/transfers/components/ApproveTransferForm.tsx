"use client";

import { useEffect, useState, type FormEvent } from "react";
import { ApiError, useAuth } from "@/lib/auth-context";
import { api, type AcademicYear, type Transfer } from "@/lib/api";
import { useYearClasses } from "@/lib/useYearClasses";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { FormField, Select } from "@/components/ui/FormControls";

export function ApproveTransferForm({
  schoolId,
  transfer,
  onDone,
  onCancel,
}: {
  schoolId: string;
  transfer: Transfer;
  onDone: (updated: Transfer) => void;
  onCancel: () => void;
}) {
  const { accessToken } = useAuth();
  const [years, setYears] = useState<AcademicYear[]>([]);
  const [academicYearId, setAcademicYearId] = useState("");
  const [classId, setClassId] = useState("");
  const [sectionId, setSectionId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!accessToken) return;
    api.listAcademicYears(accessToken, schoolId).then((y) => {
      setYears(y);
      const current = y.find((yr) => yr.isCurrent) ?? y[0];
      if (current) setAcademicYearId(current.id);
    });
  }, [accessToken, schoolId]);

  // The SELECTED year's own classes; the first one is preselected, as before.
  const classes = useYearClasses(accessToken, schoolId, academicYearId);
  const [prevClasses, setPrevClasses] = useState(classes);
  if (classes !== prevClasses) {
    setPrevClasses(classes);
    if (!classes.some((c) => c.id === classId)) {
      setClassId(classes[0]?.id ?? "");
      setSectionId(classes[0]?.sections[0]?.id ?? "");
    }
  }

  const selectedClass = classes.find((c) => c.id === classId);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!accessToken) return;
    setError(null);
    setSubmitting(true);
    try {
      const updated = await api.approveTransfer(accessToken, transfer.id, { academicYearId, classId, sectionId });
      onDone(updated);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to approve transfer");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="mt-3 space-y-3 border-t border-border pt-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <FormField label="Academic year">
          <Select value={academicYearId} onChange={(e) => setAcademicYearId(e.target.value)}>
            {years.map((y) => (
              <option key={y.id} value={y.id}>
                {y.name}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label="Class">
          <Select
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
        <FormField label="Section">
          <Select value={sectionId} onChange={(e) => setSectionId(e.target.value)}>
            {selectedClass?.sections.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </FormField>
      </div>
      {error && <Alert tone="danger">{error}</Alert>}
      <div className="flex gap-2">
        <Button type="submit" size="sm" loading={submitting}>
          Accept &amp; Enroll
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
