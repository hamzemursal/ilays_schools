"use client";

import { useState } from "react";
import { ApiError } from "@/lib/auth-context";
import { api, type Exam } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/FormControls";
import { useToast } from "@/components/ui/Toast";
import { Pencil } from "lucide-react";

type ExamSubjectRow = Exam["examSubjects"][number];

// Same rules the server enforces (ExamsService): maximum marks a whole number
// above 0; pass mark optional, a whole number from 0 up to the maximum.
// Returns the first problem to show, or null when the pair is valid. The
// server stays the authority (it also refuses a maximum below an entered
// mark, or any change once results are approved/published).
export function marksConfigError(maxMarks: string, passingMark: string): string | null {
  const max = Number(maxMarks);
  if (!maxMarks.trim() || !Number.isInteger(max) || max <= 0) return "Maximum marks must be a whole number above 0.";
  if (max > 1000) return "Maximum marks can't be more than 1000.";
  if (passingMark.trim()) {
    const pass = Number(passingMark);
    if (!Number.isInteger(pass) || pass < 0) return "Pass mark must be a whole number, 0 or more.";
    if (pass > max) return "Pass mark can't be higher than the maximum marks.";
  }
  return null;
}

// Admin-only control (the caller renders it only when the user can manage
// exams; the endpoint itself requires results.approve): a Teacher never sees
// it and can't reach the API behind it.
export function ExamSubjectMarksEditor({
  schoolId,
  accessToken,
  examId,
  examSubject,
  onUpdated,
}: {
  schoolId: string;
  accessToken: string;
  examId: string;
  examSubject: ExamSubjectRow;
  onUpdated: (updated: ExamSubjectRow) => void;
}) {
  const { show } = useToast();
  const [editing, setEditing] = useState(false);
  const [maxMarks, setMaxMarks] = useState(String(examSubject.maxMarks));
  const [passingMark, setPassingMark] = useState(examSubject.passingMark === null ? "" : String(examSubject.passingMark));
  const [saving, setSaving] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const validationError = marksConfigError(maxMarks, passingMark);
  const name = `${examSubject.class.name} ${examSubject.subject.name}`;

  function open() {
    setMaxMarks(String(examSubject.maxMarks));
    setPassingMark(examSubject.passingMark === null ? "" : String(examSubject.passingMark));
    setServerError(null);
    setEditing(true);
  }

  async function save() {
    if (validationError) return;
    setSaving(true);
    setServerError(null);
    try {
      const updated = await api.updateExamSubject(accessToken, schoolId, examId, examSubject.id, {
        maxMarks: Number(maxMarks),
        passingMark: passingMark.trim() ? Number(passingMark) : null,
      });
      onUpdated({ ...examSubject, ...updated });
      setEditing(false);
      show(`Marks updated for ${name}.`);
    } catch (err) {
      setServerError(err instanceof ApiError ? err.message : "Failed to update marks");
    } finally {
      setSaving(false);
    }
  }

  if (!editing) {
    return (
      <Button type="button" size="sm" variant="ghost" icon={<Pencil className="size-3.5" />} onClick={open} aria-label={`Edit marks for ${name}`}>
        Edit marks
      </Button>
    );
  }

  return (
    <div className="flex w-full flex-wrap items-center gap-2 rounded-lg border border-border bg-surface-soft p-2">
      <label className="flex items-center gap-1.5 text-sm text-foreground-soft">
        Max
        <Input
          type="number"
          min={1}
          max={1000}
          step={1}
          value={maxMarks}
          onChange={(e) => setMaxMarks(e.target.value)}
          className="h-8 w-24 py-1 text-sm"
          aria-label={`Maximum marks for ${name}`}
        />
      </label>
      <label className="flex items-center gap-1.5 text-sm text-foreground-soft">
        Pass
        <Input
          type="number"
          min={0}
          step={1}
          value={passingMark}
          onChange={(e) => setPassingMark(e.target.value)}
          placeholder="none"
          className="h-8 w-24 py-1 text-sm"
          aria-label={`Pass mark for ${name}`}
        />
      </label>
      <Button type="button" size="sm" loading={saving} disabled={validationError !== null} onClick={save}>
        Save
      </Button>
      <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(false)}>
        Cancel
      </Button>
      {(validationError || serverError) && <p className="w-full text-sm text-danger">{serverError ?? validationError}</p>}
    </div>
  );
}
