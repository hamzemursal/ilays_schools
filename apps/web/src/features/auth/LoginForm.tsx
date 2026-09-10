"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";
import { useAuth, ApiError } from "@/lib/auth-context";
import { Button } from "@/components/ui/Button";
import { FormField, Input } from "@/components/ui/FormControls";
import { Alert } from "@/components/ui/Alert";

// The one real login form, reused by every */login page (Student, Parent,
// Admin, Teacher, Super Admin). All of them call the exact same
// POST /auth/login — the backend already resolves either a real email or a
// Student Login ID from one field (see AuthService.resolveLoginUser) — so
// nothing here is role-specific except the label/placeholder shown, where a
// successful sign-in lands, and (when a page passes it) which roles that
// page's URL is actually meant for. Never duplicate the submit/error logic
// per role.
export function LoginForm({
  identifierLabel,
  identifierPlaceholder,
  redirectTo,
  allowedRoles,
  wrongRoleMessage,
}: {
  identifierLabel: string;
  identifierPlaceholder: string;
  redirectTo: string;
  // When set, a successful login is immediately signed back out (not just
  // redirected elsewhere) unless the account has at least one of these
  // roles — e.g. a Teacher account typing their real password into
  // /super-admin/login should never end up signed in at all, even briefly,
  // just because that URL happens to accept the same universal login.
  allowedRoles?: string[];
  wrongRoleMessage?: string;
}) {
  const router = useRouter();
  const { login, completeMfaLogin, logout } = useAuth();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Set only once password verification says the account has 2FA enabled —
  // its presence is what switches the form to the code-entry phase below.
  const [mfaToken, setMfaToken] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [useRecoveryCode, setUseRecoveryCode] = useState(false);

  function afterLogin(profile: { roles: string[] }) {
    if (allowedRoles && !allowedRoles.some((role) => profile.roles.includes(role))) {
      logout();
      setError(wrongRoleMessage ?? "This account doesn't have access to this portal.");
      return;
    }
    router.push(redirectTo);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const result = await login(identifier, password);
      if ("mfaRequired" in result) {
        setMfaToken(result.mfaToken);
        return;
      }
      afterLogin(result);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function onSubmitCode(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const profile = await completeMfaLogin(mfaToken!, useRecoveryCode ? { recoveryCode: code } : { code });
      afterLogin(profile);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (mfaToken) {
    return (
      <form onSubmit={onSubmitCode} className="rounded-xl border border-border bg-background p-6 shadow-sm">
        <div className="space-y-4">
          <FormField
            label={useRecoveryCode ? "Recovery code" : "Authentication code"}
            htmlFor="mfa-code"
            required
            hint={
              useRecoveryCode
                ? "One of the one-time codes you saved when you enabled two-factor authentication."
                : "The 6-digit code from your authenticator app."
            }
          >
            <Input
              id="mfa-code"
              type="text"
              inputMode={useRecoveryCode ? "text" : "numeric"}
              autoFocus
              required
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder={useRecoveryCode ? "XXXXX-XXXXX" : "123456"}
            />
          </FormField>
        </div>

        {error && (
          <Alert tone="danger" className="mt-4">
            {error}
          </Alert>
        )}

        <Button type="submit" loading={submitting} className="mt-6 w-full">
          {submitting ? "Verifying…" : "Verify"}
        </Button>
        <button
          type="button"
          onClick={() => {
            setUseRecoveryCode((v) => !v);
            setCode("");
            setError(null);
          }}
          className="mt-3 w-full text-center text-sm text-accent hover:underline"
        >
          {useRecoveryCode ? "Use your authenticator app instead" : "Use a recovery code instead"}
        </button>
      </form>
    );
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
          <div className="relative">
            <Input
              id="password"
              type={showPassword ? "text" : "password"}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="pr-9"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-foreground-muted hover:text-foreground"
            >
              {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
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
