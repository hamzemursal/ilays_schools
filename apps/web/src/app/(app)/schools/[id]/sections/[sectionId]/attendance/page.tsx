"use client";

import { use, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useAuth, ApiError } from "@/lib/auth-context";
import { api, type AttendanceRow, type AttendanceStatus } from "@/lib/api";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { EmptyState } from "@/components/ui/EmptyState";
import { SkeletonTable } from "@/components/ui/Skeleton";
import { FormField, Input } from "@/components/ui/FormControls";
import { useToast } from "@/components/ui/Toast";
import { CheckCircle2, ClipboardCheck } from "lucide-react";

const STATUSES: { value: AttendanceStatus; label: string; on: string }[] = [
  { value: "PRESENT", label: "Present", on: "bg-success text-white" },
  { value: "ABSENT", label: "Absent", on: "bg-danger text-white" },
  { value: "LATE", label: "Late", on: "bg-warning text-white" },
  { value: "EXCUSED", label: "Excused", on: "bg-accent text-white" },
];

export default function AttendancePage({ params }: { params: Promise<{ id: string; sectionId: string }> }) {
  const { id: schoolId, sectionId } = use(params);
  const searchParams = useSearchParams();
  const { accessToken } = useAuth();
  const { show } = useToast();

  // Purely for display — attendance itself is recorded per section per
  // day, not per subject, so these only appear when a caller (e.g. an
  // assignment's "Mark attendance" link) supplies them as context.
  const yearName = searchParams.get("year");
  const className = searchParams.get("class");
  const sectionName = searchParams.get("section");
  const subjectName = searchParams.get("subject");

  const [date, setDate] = useState(searchParams.get("date") ?? new Date().toISOString().slice(0, 10));
  const [rows, setRows] = useState<AttendanceRow[] | null>(null);
  const [pending, setPending] = useState<Record<string, AttendanceStatus>>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!accessToken) return;
    api
      .getAttendance(accessToken, schoolId, sectionId, date)
      .then((data) => {
        setRows(data);
        // No record yet for a student today defaults to Present, so a
        // typical "everyone showed up" day is a single click to save;
        // the teacher only needs to touch the exceptions.
        setPending(Object.fromEntries(data.map((r) => [r.enrollmentId, r.status ?? "PRESENT"])));
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load attendance"));
  }, [accessToken, schoolId, sectionId, date]);

  async function save() {
    if (!accessToken || !rows) return;
    setSaving(true);
    setError(null);
    try {
      const entries = Object.entries(pending).map(([enrollmentId, status]) => ({ enrollmentId, status }));
      const updated = await api.markAttendance(accessToken, schoolId, sectionId, date, entries);
      setRows(updated);
      setSaved(true);
      show("Attendance saved.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to save attendance");
    } finally {
      setSaving(false);
    }
  }

  const title =
    className && sectionName ? `${className} · ${sectionName}${subjectName ? ` — ${subjectName}` : ""}` : "Mark attendance";

  return (
    <div>
      <PageHeader
        eyebrow="Attendance"
        title={title}
        description={yearName ?? undefined}
        breadcrumbs={[{ label: "My classes", href: "/my-classes" }, { label: "Attendance" }]}
      />

      <div className="mx-auto max-w-2xl space-y-5 p-4 sm:p-6">
        <Card>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <FormField label="Date" htmlFor="date" className="max-w-xs">
              <Input
                id="date"
                type="date"
                value={date}
                onChange={(e) => {
                  setDate(e.target.value);
                  setSaved(false);
                }}
              />
            </FormField>
            {(className || subjectName) && (
              <div className="flex flex-wrap gap-1.5">
                {className && <Badge tone="accent">{className}{sectionName ? ` · ${sectionName}` : ""}</Badge>}
                {subjectName && <Badge tone="accent">{subjectName}</Badge>}
                {yearName && <Badge tone="neutral">{yearName}</Badge>}
              </div>
            )}
          </div>
        </Card>

        {error && <Alert tone="danger">{error}</Alert>}

        {!rows ? (
          <SkeletonTable rows={5} cols={2} />
        ) : rows.length === 0 ? (
          <EmptyState icon={ClipboardCheck} title="No active students" description="This section has no active students to mark." />
        ) : (
          <div className="space-y-2">
            {rows.map((r) => (
              <Card key={r.enrollmentId} padding="sm">
                <div className="flex flex-col gap-2 p-2 sm:flex-row sm:items-center sm:justify-between">
                  <p className="font-medium text-foreground">
                    <span className="text-foreground-muted">#{r.rollNumber}</span> {r.firstName} {r.lastName}
                  </p>
                  <div className="grid grid-cols-4 gap-1 sm:flex sm:gap-2">
                    {STATUSES.map((s) => {
                      const isOn = pending[r.enrollmentId] === s.value;
                      return (
                        <button
                          key={s.value}
                          type="button"
                          onClick={() => {
                            setPending((prev) => ({ ...prev, [r.enrollmentId]: s.value }));
                            setSaved(false);
                          }}
                          className={`rounded-lg border px-2 py-2.5 text-xs font-semibold transition-colors sm:px-3 sm:text-sm ${
                            isOn ? s.on + " border-transparent" : "border-border text-foreground-soft hover:border-accent"
                          }`}
                        >
                          {s.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}

        {rows && rows.length > 0 && (
          <div className="flex flex-wrap items-center gap-3">
            <Button icon={<CheckCircle2 className="size-4" />} loading={saving} onClick={save}>
              Save attendance
            </Button>
            {saved && <span className="text-sm text-success">Saved — {rows.length} student(s) recorded for {new Date(date).toLocaleDateString()}.</span>}
          </div>
        )}
      </div>
    </div>
  );
}
