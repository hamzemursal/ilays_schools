"use client";

import { useState } from "react";
import { RotateCcw } from "lucide-react";
import { ApiError } from "@/lib/auth-context";
import { api, type StudentEnrollmentRecord } from "@/lib/api";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { ReasonPromptDialog } from "@/components/ui/ReasonPromptDialog";

// Undo a Graduation (Form 4) or Primary Completion (Class 8) recorded by
// mistake. The backend (StudentLifecycleService.reverseFinalOutcome) decides
// whether it is still safe — e.g. not once the student continued to Form 1,
// transferred, or was archived — and records the reason in the audit log.
export function UndoFinalOutcomeCard({
  accessToken,
  enrollment,
  studentName,
  onRestored,
}: {
  accessToken: string;
  enrollment: StudentEnrollmentRecord;
  studentName: string;
  onRestored: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const graduated = enrollment.status === "GRADUATED";
  const what = graduated ? "graduation" : "Class 8 completion";

  async function confirm(reason: string) {
    setSaving(true);
    setError(null);
    try {
      await api.reverseFinalOutcome(accessToken, enrollment.school.id, enrollment.id, { reason });
      setOpen(false);
      onRestored();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : `Could not undo the ${what}`);
      setOpen(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="rounded-2xl">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-foreground">{graduated ? "Undo graduation" : "Undo Class 8 completion"}</h3>
          <p className="mt-0.5 text-sm text-foreground-soft">
            Marked {graduated ? "Graduated" : "Completed"} by mistake? Restore {studentName} to an active student in{" "}
            <span className="font-medium text-foreground">
              {enrollment.class.name} · {enrollment.section.name}, {enrollment.academicYear.name}
            </span>
            . The Student ID, results, attendance and history are kept.
          </p>
        </div>
        <Button variant="outline" size="sm" icon={<RotateCcw className="size-4" />} onClick={() => setOpen(true)}>
          {graduated ? "Undo graduation" : "Undo completion"}
        </Button>
      </div>
      {error && (
        <Alert tone="danger" className="mt-3">
          {error}
        </Alert>
      )}
      <ReasonPromptDialog
        open={open}
        title={graduated ? `Undo ${studentName}'s graduation?` : `Undo ${studentName}'s Class 8 completion?`}
        description={`${studentName} becomes an ACTIVE student again in ${enrollment.class.name} · ${enrollment.section.name} (${enrollment.academicYear.name}) and leaves the Alumni list. Give the reason — it is kept in the audit log.`}
        confirmLabel={graduated ? "Undo graduation" : "Undo completion"}
        loading={saving}
        onConfirm={confirm}
        onCancel={() => setOpen(false)}
      />
    </Card>
  );
}
