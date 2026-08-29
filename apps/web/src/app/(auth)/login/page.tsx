"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { GraduationCap } from "lucide-react";
import { useAuth, ApiError } from "@/lib/auth-context";
import { Button } from "@/components/ui/Button";
import { FormField, Input } from "@/components/ui/FormControls";
import { Alert } from "@/components/ui/Alert";

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(email, password);
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <div className="mb-8 flex flex-col items-center text-center">
        <div className="flex size-12 items-center justify-center rounded-xl bg-accent text-white shadow-md">
          <GraduationCap className="size-6" />
        </div>
        <h1 className="mt-4 text-xl font-semibold text-foreground">Ilays Schools ERP</h1>
        <p className="mt-1 text-sm text-foreground-soft">Sign in to your account</p>
      </div>

      <form onSubmit={onSubmit} className="rounded-xl border border-border bg-background p-6 shadow-sm">
        <div className="space-y-4">
          <FormField label="Email" htmlFor="email" required>
            <Input
              id="email"
              type="email"
              required
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@saamalay.test"
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
    </div>
  );
}
