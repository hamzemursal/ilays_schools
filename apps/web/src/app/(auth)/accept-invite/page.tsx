"use client";

import { Suspense, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { KeyRound } from "lucide-react";
import { useAuth, ApiError } from "@/lib/auth-context";
import { Button } from "@/components/ui/Button";
import { FormField, Input } from "@/components/ui/FormControls";
import { Alert } from "@/components/ui/Alert";

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
    return <Alert tone="danger">This invite link is missing its token.</Alert>;
  }

  return (
    <div>
      <div className="mb-8 flex flex-col items-center text-center">
        <div className="flex size-12 items-center justify-center rounded-xl bg-accent text-white shadow-md">
          <KeyRound className="size-6" />
        </div>
        <h1 className="mt-4 text-xl font-semibold text-foreground">Choose a password</h1>
        <p className="mt-1 text-sm text-foreground-soft">At least 10 characters.</p>
      </div>

      <form onSubmit={onSubmit} className="rounded-xl border border-border bg-background p-6 shadow-sm">
        <div className="space-y-4">
          <FormField label="New password" htmlFor="password" required>
            <Input
              id="password"
              type="password"
              required
              autoFocus
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </FormField>

          <FormField label="Confirm password" htmlFor="confirm" required>
            <Input
              id="confirm"
              type="password"
              required
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </FormField>
        </div>

        {error && (
          <Alert tone="danger" className="mt-4">
            {error}
          </Alert>
        )}

        <Button type="submit" loading={submitting} className="mt-6 w-full">
          {submitting ? "Setting up…" : "Activate account"}
        </Button>
      </form>
    </div>
  );
}

export default function AcceptInvitePage() {
  return (
    <Suspense fallback={null}>
      <AcceptInviteForm />
    </Suspense>
  );
}
