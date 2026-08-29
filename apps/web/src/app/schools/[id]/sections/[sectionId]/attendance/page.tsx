"use client";

import { use, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth, ApiError } from "@/lib/auth-context";
import { api, type AttendanceRow, type AttendanceStatus } from "@/lib/api";

const STATUSES: { value: AttendanceStatus; label: string; on: string }[] = [
  { value: "PRESENT", label: "Present", on: "bg-success text-white" },
  { value: "ABSENT", label: "Absent", on: "bg-danger text-white" },
  { value: "LATE", label: "Late", on: "bg-warning text-white" },
  { value: "EXCUSED", label: "Excused", on: "bg-accent text-white" },
];

export default function AttendancePage({ params }: { params: Promise<{ id: string; sectionId: string }> }) {
  const { id: schoolId, sectionId } = use(params);
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, accessToken, loading } = useAuth();

  const [date, setDate] = useState(searchParams.get("date") ?? new Date().toISOString().slice(0, 10));
  const [rows, setRows] = useState<AttendanceRow[] | null>(null);
  const [pending, setPending] = useState<Record<string, AttendanceStatus>>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!loading && !user) router.push("/login");
  }, [loading, user, router]);

  useEffect(() => {
    if (!accessToken) return;
    api
      .getAttendance(accessToken, schoolId, sectionId, date)
      .then((data) => {
        setRows(data);
        setPending(Object.fromEntries(data.filter((r) => r.status).map((r) => [r.enrollmentId, r.status!])));
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
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to save attendance");
    } finally {
      setSaving(false);
    }
  }

  if (loading || !user) return <p className="p-8 text-foreground-soft">Loading…</p>;

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-10 sm:px-6 sm:py-16">
      <span className="text-sm font-semibold uppercase tracking-wide text-accent">Attendance</span>
      <h1 className="mt-1 text-2xl font-semibold text-foreground">Mark attendance</h1>

      <div className="mt-4">
        <label className="block text-sm font-medium text-foreground-soft" htmlFor="date">
          Date
        </label>
        <input
          id="date"
          type="date"
          value={date}
          onChange={(e) => {
            setDate(e.target.value);
            setSaved(false);
          }}
          className="mt-1 w-full max-w-xs rounded-lg border border-border bg-background px-3 py-2 text-foreground outline-none focus:border-accent sm:w-auto"
        />
      </div>

      {error && <p className="mt-4 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}

      <div className="mt-6 space-y-2">
        {rows?.map((r) => (
          <div
            key={r.enrollmentId}
            className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-3 sm:flex-row sm:items-center sm:justify-between sm:p-4"
          >
            <p className="font-medium text-foreground">
              <span className="text-foreground-soft">#{r.rollNumber}</span> {r.firstName} {r.lastName}
            </p>
            <div className="grid grid-cols-4 gap-1 sm:flex sm:gap-2">
              {STATUSES.map((s) => {
                const isOn = pending[r.enrollmentId] === s.value;
                return (
                  <button
                    key={s.value}
                    type="button"
                    onClick={() => setPending((prev) => ({ ...prev, [r.enrollmentId]: s.value }))}
                    className={`rounded-lg border px-2 py-1.5 text-xs font-medium transition-colors sm:text-sm ${
                      isOn ? s.on + " border-transparent" : "border-border text-foreground-soft hover:border-accent"
                    }`}
                  >
                    {s.label}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
        {rows?.length === 0 && <p className="text-sm text-foreground-soft">No active students in this section.</p>}
      </div>

      {rows && rows.length > 0 && (
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <button
            onClick={save}
            disabled={saving}
            className="rounded-lg bg-accent px-4 py-2 font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {saving ? "Saving…" : "Save attendance"}
          </button>
          {saved && <span className="text-sm text-success">Saved.</span>}
        </div>
      )}
    </div>
  );
}
