"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth, ApiError } from "@/lib/auth-context";
import { api, type AuditLogEntry } from "@/lib/api";

export default function AuditLogPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: schoolId } = use(params);
  const router = useRouter();
  const { user, accessToken, loading } = useAuth();

  const [logs, setLogs] = useState<AuditLogEntry[] | null>(null);
  const [actionFilter, setActionFilter] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) router.push("/login");
  }, [loading, user, router]);

  useEffect(() => {
    if (!accessToken) return;
    api
      .listAuditLogs(accessToken, schoolId, actionFilter || undefined)
      .then(setLogs)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load audit log"));
  }, [accessToken, schoolId, actionFilter]);

  if (loading || !user) return <p className="p-8 text-foreground-soft">Loading…</p>;

  const schoolName = user.schools.find((s) => s.id === schoolId)?.name ?? "School";

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-6 sm:py-16">
      <span className="text-sm font-semibold uppercase tracking-wide text-accent">Audit log</span>
      <h1 className="mt-1 text-2xl font-semibold text-foreground">{schoolName}</h1>

      <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:items-center">
        <label htmlFor="action-filter" className="text-sm font-medium text-foreground-soft">
          Filter by action
        </label>
        <input
          id="action-filter"
          type="text"
          value={actionFilter}
          onChange={(e) => setActionFilter(e.target.value)}
          placeholder="e.g. student.update"
          className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground sm:w-64"
        />
      </div>

      {error && <p className="mt-4 rounded-lg bg-danger-soft px-4 py-3 text-danger">{error}</p>}

      {!error && !logs && <p className="mt-6 text-foreground-soft">Loading…</p>}

      {!error && logs && logs.length === 0 && (
        <p className="mt-6 text-foreground-soft">No audit events found.</p>
      )}

      {!error && logs && logs.length > 0 && (
        <div className="mt-6 overflow-x-auto rounded-xl border border-border">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="bg-surface-soft text-xs font-semibold uppercase tracking-wide text-foreground-soft">
              <tr>
                <th className="px-4 py-3">When</th>
                <th className="px-4 py-3">Actor</th>
                <th className="px-4 py-3">Action</th>
                <th className="px-4 py-3">Target</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {logs.map((log) => (
                <tr key={log.id} className="bg-surface">
                  <td className="whitespace-nowrap px-4 py-3 text-foreground-soft">
                    {new Date(log.createdAt).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-foreground">{log.actorEmail}</td>
                  <td className="px-4 py-3">
                    <span className="rounded-full bg-accent-soft px-2 py-0.5 text-xs font-medium text-accent">
                      {log.action}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-foreground-soft">
                    {log.resource} · {log.resourceId ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
