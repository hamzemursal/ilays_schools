"use client";

import { useState, type FormEvent } from "react";
import { useAuth, ApiError } from "@/lib/auth-context";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { FormField, Input } from "@/components/ui/FormControls";

// Used two ways: as the forced full-page gate AppShell renders whenever
// user.mustChangePassword is true (a Student Portal account's first login,
// see StudentsService.createPortalAccount), and as the ordinary content of
// /student/change-password for a voluntary change later. Same form either
// way — only the surrounding page chrome differs.
export function ChangePasswordForm({ forced, onSuccess }: { forced?: boolean; onSuccess?: () => void }) {
  const { accessToken, refreshProfile } = useAuth();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!accessToken) return;
    setError(null);

    if (newPassword.length < 10) {
      setError("New password must be at least 10 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("New password and confirmation don't match.");
      return;
    }

    setSubmitting(true);
    try {
      await api.changeMyPassword(accessToken, currentPassword, newPassword);
      await refreshProfile();
      setSuccess(true);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      onSuccess?.();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to change password");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {forced && (
        <Alert tone="info">
          Your account was set up with a temporary password. Choose a new one to continue.
        </Alert>
      )}
      {success && !forced && <Alert tone="success">Password changed successfully.</Alert>}
      {error && <Alert tone="danger">{error}</Alert>}

      <FormField label={forced ? "Temporary password" : "Current password"} required>
        <Input
          type="password"
          required
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          autoComplete="current-password"
        />
      </FormField>
      <FormField label="New password" required>
        <Input
          type="password"
          required
          minLength={10}
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          autoComplete="new-password"
        />
      </FormField>
      <FormField label="Confirm new password" required>
        <Input
          type="password"
          required
          minLength={10}
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          autoComplete="new-password"
        />
      </FormField>

      <Button type="submit" loading={submitting} className="w-full">
        {forced ? "Set new password" : "Change password"}
      </Button>
    </form>
  );
}
