"use client";

import { use, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth, ApiError } from "@/lib/auth-context";
import { api, type School } from "@/lib/api";

export default function SchoolDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { user, accessToken, loading } = useAuth();

  const [school, setSchool] = useState<School | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [email, setEmail] = useState("");
  const [acceptUrl, setAcceptUrl] = useState<string | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!loading && !user) router.push("/login");
  }, [loading, user, router]);

  useEffect(() => {
    if (!accessToken) return;
    api
      .getSchool(accessToken, id)
      .then(setSchool)
      .catch((err) => setLoadError(err instanceof ApiError ? err.message : "Failed to load school"));
  }, [accessToken, id]);

  async function onInvite(e: FormEvent) {
    e.preventDefault();
    if (!accessToken) return;
    setInviteError(null);
    setAcceptUrl(null);
    setSubmitting(true);
    try {
      const result = await api.inviteSchoolAdmin(accessToken, id, email);
      setAcceptUrl(result.acceptUrl);
      setEmail("");
    } catch (err) {
      setInviteError(err instanceof ApiError ? err.message : "Failed to send invitation");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading || !user) return <p className="p-8 text-foreground-soft">Loading…</p>;
  if (loadError) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-16">
        <p className="rounded-lg bg-danger-soft px-4 py-3 text-danger">{loadError}</p>
      </div>
    );
  }
  if (!school) return <p className="p-8 text-foreground-soft">Loading…</p>;

  const canManage = user.permissions.includes("schools.manage");

  return (
    <div className="mx-auto w-full max-w-2xl px-6 py-16">
      <span className="text-sm font-semibold uppercase tracking-wide text-accent">School</span>
      <h1 className="mt-1 text-2xl font-semibold text-foreground">{school.name}</h1>
      <p className="mt-1 text-foreground-soft">{school.type.replace(/_/g, " ")} · {school.status}</p>

      {user.permissions.includes("academic.view") && (
        <Link
          href={`/schools/${school.id}/academic`}
          className="mt-6 flex items-center justify-between rounded-xl border border-border bg-surface p-4 hover:border-accent"
        >
          <span className="font-medium text-foreground">Academic structure</span>
          <span className="text-accent">→</span>
        </Link>
      )}

      {canManage && (
        <form onSubmit={onInvite} className="mt-8 rounded-xl border border-border bg-surface p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-foreground-soft">
            Invite a School Admin
          </h2>
          <p className="mt-1 text-sm text-foreground-soft">
            Creates a pending account scoped to this school only — no password is set until they accept.
          </p>

          <label className="mt-4 block text-sm font-medium text-foreground-soft" htmlFor="email">
            Email
          </label>
          <input
            id="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-foreground outline-none focus:border-accent"
            placeholder="admin@example.school"
          />

          {inviteError && (
            <p className="mt-3 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{inviteError}</p>
          )}

          {acceptUrl && (
            <div className="mt-3 rounded-lg bg-success-soft px-3 py-2 text-sm text-success">
              <p className="font-medium">Invitation created.</p>
              <p className="mt-1 break-all font-mono text-xs">{acceptUrl}</p>
              <p className="mt-1 text-foreground-soft">
                Email delivery isn&apos;t wired up yet — share this link with them directly for now.
              </p>
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="mt-4 rounded-lg bg-accent px-4 py-2 font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {submitting ? "Sending…" : "Send invitation"}
          </button>
        </form>
      )}
    </div>
  );
}
