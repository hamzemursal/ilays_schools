"use client";

import { useEffect, useState } from "react";

type HealthResponse = {
  status: "ok" | "degraded";
  database: { ok: boolean; error?: string };
  redis: { ok: boolean; error?: string };
  timestamp: string;
};

type State =
  | { phase: "loading" }
  | { phase: "unreachable" }
  | { phase: "loaded"; data: HealthResponse };

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api/v1";

function Pill({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-medium ${
        ok ? "bg-success-soft text-success" : "bg-danger-soft text-danger"
      }`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {label} — {ok ? "connected" : "unreachable"}
    </span>
  );
}

export function HealthStatus() {
  const [state, setState] = useState<State>({ phase: "loading" });

  useEffect(() => {
    let cancelled = false;

    async function check() {
      try {
        const res = await fetch(`${API_URL}/health`, { cache: "no-store" });
        const data: HealthResponse = await res.json();
        if (!cancelled) setState({ phase: "loaded", data });
      } catch {
        if (!cancelled) setState({ phase: "unreachable" });
      }
    }

    check();
    const interval = setInterval(check, 8000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  return (
    <div className="rounded-xl border border-border bg-surface p-6">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-foreground-soft">
        System status
      </h2>

      {state.phase === "loading" && (
        <p className="mt-3 text-foreground-soft">Checking the API…</p>
      )}

      {state.phase === "unreachable" && (
        <div className="mt-3 space-y-2">
          <Pill ok={false} label="API" />
          <p className="text-sm text-foreground-soft">
            Can&apos;t reach the API at <code className="font-mono">{API_URL}</code>. Make
            sure it&apos;s running with <code className="font-mono">pnpm dev</code>.
          </p>
        </div>
      )}

      {state.phase === "loaded" && (
        <div className="mt-3 flex flex-wrap gap-3">
          <Pill ok={state.data.database.ok} label="PostgreSQL" />
          <Pill ok={state.data.redis.ok} label="Redis" />
        </div>
      )}
    </div>
  );
}
