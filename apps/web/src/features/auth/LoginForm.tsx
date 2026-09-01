"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useAuth, ApiError } from "@/lib/auth-context";
import { Button } from "@/components/ui/Button";
import { FormField, Input } from "@/components/ui/FormControls";
import { Alert } from "@/components/ui/Alert";

// The one real login form, reused by every */login page (Student, Parent,
// Admin, Teacher). All four call the exact same POST /auth/login — the
// backend already resolves either a real email or a Student Login ID from
// one field (see AuthService.resolveLoginUser) — so nothing here is
// role-specific except the label/placeholder shown and where a successful
// sign-in lands. Never duplicate the submit/error logic per role.
export function LoginForm({
  identifierLabel,
  identifierPlaceholder,
  redirectTo,
}: {
  identifierLabel: string;
  identifierPlaceholder: string;
  redirectTo: string;
}) {
  const router = useRouter();
  const { login } = useAuth();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(identifier, password);
      router.push(redirectTo);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="rounded-xl border border-border bg-background p-6 shadow-sm">
      <div className="space-y-4">
        <FormField label={identifierLabel} htmlFor="identifier" required>
          <Input
            id="identifier"
            type="text"
            required
            autoFocus
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            placeholder={identifierPlaceholder}
          />
        </FormField>

        <FormField label="Password" htmlFor="password" required>
          <Input
            id="password"
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </FormField>
      </div>

      {error && (
        <Alert tone="danger" className="mt-4">
          {error}
        </Alert>
      )}

      <Button type="submit" loading={submitting} className="mt-6 w-full">
        {submitting ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}
