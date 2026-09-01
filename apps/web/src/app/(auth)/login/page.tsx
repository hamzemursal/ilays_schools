"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { BookUser, GraduationCap, ShieldCheck, Users } from "lucide-react";
import { useAuth, ApiError } from "@/lib/auth-context";
import { Button } from "@/components/ui/Button";
import { FormField, Input } from "@/components/ui/FormControls";
import { Alert } from "@/components/ui/Alert";

// Purely a presentation choice — every one of these still calls the exact
// same POST /auth/login. The backend already resolves a real email (Admin/
// Teacher/Parent) or a Student Login ID (Student) from the same field (see
// AuthService.resolveLoginUser); this just picks which label/placeholder
// makes sense for whoever's sitting at the screen, instead of one field
// asking everyone for "Email or Student ID" at once.
const AUDIENCES = [
  { key: "admin", tab: "Admin / Staff", icon: ShieldCheck, fieldLabel: "Email", placeholder: "you@school.com" },
  { key: "teacher", tab: "Teacher", icon: BookUser, fieldLabel: "Email", placeholder: "you@school.com" },
  { key: "parent", tab: "Parent", icon: Users, fieldLabel: "Email", placeholder: "you@school.com" },
  {
    key: "student",
    tab: "Student",
    icon: GraduationCap,
    fieldLabel: "Student Login ID",
    placeholder: "STU-2027-00003",
  },
] as const;

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuth();
  const [audience, setAudience] = useState<(typeof AUDIENCES)[number]["key"]>("admin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const current = AUDIENCES.find((a) => a.key === audience)!;

  function onSelectAudience(key: (typeof AUDIENCES)[number]["key"]) {
    setAudience(key);
    setError(null);
  }

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
        <h1 className="mt-4 text-xl font-semibold text-foreground">Ilays Schools</h1>
        <p className="mt-1 text-sm text-foreground-soft">Sign in to your account</p>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-2">
        {AUDIENCES.map((a) => (
          <button
            key={a.key}
            type="button"
            onClick={() => onSelectAudience(a.key)}
            className={`flex items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
              audience === a.key
                ? "border-accent bg-accent-soft text-accent"
                : "border-border bg-background text-foreground-soft hover:border-border-strong"
            }`}
          >
            <a.icon className="size-4" />
            {a.tab}
          </button>
        ))}
      </div>

      <form onSubmit={onSubmit} className="rounded-xl border border-border bg-background p-6 shadow-sm">
        <div className="space-y-4">
          <FormField label={current.fieldLabel} htmlFor="email" required>
            <Input
              id="email"
              type="text"
              required
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={current.placeholder}
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
