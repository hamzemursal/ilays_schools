"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth, ApiError } from "@/lib/auth-context";
import { api, type ResultsForSection } from "@/lib/api";

export default function ResultsPage({
  params,
}: {
  params: Promise<{ id: string; examSubjectId: string; sectionId: string }>;
}) {
  const { id: schoolId, examSubjectId, sectionId } = use(params);
  const router = useRouter();
  const { user, accessToken, loading } = useAuth();

  const [data, setData] = useState<ResultsForSection | null>(null);
  const [pending, setPending] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!loading && !user) router.push("/login");
  }, [loading, user, router]);

  useEffect(() => {
    if (!accessToken) return;
    api
      .getResults(accessToken, schoolId, examSubjectId, sectionId)
      .then((res) => {
        setData(res);
        setPending(
          Object.fromEntries(
            res.students.filter((s) => s.marksObtained !== null).map((s) => [s.enrollmentId, s.marksObtained!]),
          ),
        );
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load results"));
  }, [accessToken, schoolId, examSubjectId, sectionId]);

  async function save() {
    if (!accessToken || !data) return;
    setSaving(true);
    setError(null);
    try {
      const entries = Object.entries(pending)
        .filter(([, v]) => v.trim() !== "")
        .map(([enrollmentId, v]) => ({ enrollmentId, marksObtained: Number(v) }));
      const updated = await api.enterMarks(accessToken, schoolId, examSubjectId, sectionId, entries);
      setData(updated);
      setSaved(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to save marks");
    } finally {
      setSaving(false);
    }
  }

  if (loading || !user) return <p className="p-8 text-foreground-soft">Loading…</p>;
  if (error && !data) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 sm:px-6">
        <p className="rounded-lg bg-danger-soft px-4 py-3 text-danger">{error}</p>
      </div>
    );
  }
  if (!data) return <p className="p-8 text-foreground-soft">Loading…</p>;

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-10 sm:px-6 sm:py-16">
      <span className="text-sm font-semibold uppercase tracking-wide text-accent">Results</span>
      <h1 className="mt-1 text-2xl font-semibold text-foreground">Enter marks</h1>
      <p className="mt-1 text-sm text-foreground-soft">Out of {data.maxMarks}</p>

      {error && <p className="mt-4 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}

      <div className="mt-6 space-y-2">
        {data.students.map((s) => {
          const isApproved = s.status === "APPROVED";
          return (
            <div
              key={s.enrollmentId}
              className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-3 sm:flex-row sm:items-center sm:justify-between sm:p-4"
            >
              <p className="font-medium text-foreground">
                <span className="text-foreground-soft">#{s.rollNumber}</span> {s.firstName} {s.lastName}
              </p>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={0}
                  max={data.maxMarks}
                  value={pending[s.enrollmentId] ?? ""}
                  disabled={isApproved}
                  onChange={(e) => setPending((prev) => ({ ...prev, [s.enrollmentId]: e.target.value }))}
                  className="w-24 rounded-lg border border-border bg-background px-3 py-1.5 text-foreground outline-none focus:border-accent disabled:opacity-60"
                />
                {isApproved ? (
                  <span className="rounded-full bg-success-soft px-3 py-1 text-xs font-medium text-success">
                    Approved
                  </span>
                ) : s.status === "ENTERED" ? (
                  <span className="rounded-full bg-warning-soft px-3 py-1 text-xs font-medium text-warning">
                    Entered
                  </span>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <button
          onClick={save}
          disabled={saving}
          className="rounded-lg bg-accent px-4 py-2 font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {saving ? "Saving…" : "Save marks"}
        </button>
        {saved && <span className="text-sm text-success">Saved.</span>}
      </div>
    </div>
  );
}
