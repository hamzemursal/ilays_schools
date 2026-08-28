"use client";

import { Suspense, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth, ApiError } from "@/lib/auth-context";

function AcceptInviteForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const { acceptInvite } = useAuth();

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (password.length < 10) {
      setError("Password must be at least 10 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }

    setSubmitting(true);
    try {
      await acceptInvite(token, password);
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!token) {
    return (
      <p className="rounded-lg bg-danger-soft px-4 py-3 text-danger">
        This invite link is missing its token.
      </p>
    );
  }

  return (
    <form onSubmit={onSubmit} className="w-full max-w-sm rounded-xl border border-border bg-surface p-6">
      <span className="text-sm font-semibold uppercase tracking-wide text-accent">Set up account</span>
      <h1 className="mt-2 text-2xl font-semibold text-foreground">Choose a password</h1>
      <p className="mt-2 text-sm text-foreground-soft">At least 10 characters.</p>

      <label className="mt-6 block text-sm font-medium text-foreground-soft" htmlFor="password">
        New password
      </label>
      <input
        id="password"
        type="password"
        required
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-foreground outline-none focus:border-accent"
      />

      <label className="mt-4 block text-sm font-medium text-foreground-soft" htmlFor="confirm">
        Confirm password
      </label>
      <input
        id="confirm"
        type="password"
        required
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
        className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-foreground outline-none focus:border-accent"
      />

      {error && <p className="mt-4 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}

      <button
        type="submit"
        disabled={submitting}
        className="mt-6 w-full rounded-lg bg-accent px-3 py-2 font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-60"
      >
        {submitting ? "Setting up…" : "Activate account"}
      </button>
    </form>
  );
}

export default function AcceptInvitePage() {
  return (
    <div className="flex flex-1 items-center justify-center px-6 py-20">
      <Suspense fallback={null}>
        <AcceptInviteForm />
      </Suspense>
    </div>
  );
}
