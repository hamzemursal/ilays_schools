"use client";

import { useState } from "react";
import { ApiError } from "@/lib/auth-context";
import { Card, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useToast } from "@/components/ui/Toast";
import { KeyRound } from "lucide-react";

export interface ResetResult {
  // What the person types to sign in (Student ID, or the parent's email).
  loginLabel: string;
  loginValue: string | null;
  temporaryPassword: string;
}

// "Reset password" for a Student or Parent who ALREADY has a portal login.
// It only ever calls the reset endpoint - never the create one - so it can't
// make a second account, and it says so. The temporary password is shown once
// (the server never returns or stores it in plaintext again); the person must
// choose their own at next login.
export function ResetPortalPasswordCard({
  personName,
  onReset,
}: {
  personName: string;
  onReset: () => Promise<ResetResult>;
}) {
  const { show } = useToast();
  const [confirming, setConfirming] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [result, setResult] = useState<ResetResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    setResetting(true);
    setError(null);
    try {
      setResult(await onReset());
      setConfirming(false);
      show("Password reset.");
    } catch (err) {
      setConfirming(false);
      setError(err instanceof ApiError ? err.message : "Failed to reset the password");
    } finally {
      setResetting(false);
    }
  }

  return (
    <Card padding="none">
      <CardHeader
        title="Reset portal password"
        description="Issue a new temporary password for the existing login. This does not create another account."
      />
      <div className="p-5">
        {result && (
          <Alert tone="success" className="mb-3">
            <p className="font-medium">Password reset — share these with {personName} now.</p>
            <div className="mt-2 space-y-1 font-mono text-sm">
              {result.loginValue && (
                <p>
                  {result.loginLabel}: {result.loginValue}
                </p>
              )}
              <p>Temporary password: {result.temporaryPassword}</p>
            </div>
            <p className="mt-2 text-foreground-soft">
              This password won&apos;t be shown again. Their previous password and any signed-in sessions no longer work,
              and they will be asked to choose their own password on next login.
            </p>
          </Alert>
        )}
        <Button size="sm" variant="outline" icon={<KeyRound className="size-4" />} onClick={() => setConfirming(true)}>
          Reset password
        </Button>
        {error && (
          <Alert tone="danger" className="mt-3">
            {error}
          </Alert>
        )}
      </div>

      <ConfirmDialog
        open={confirming}
        title={`Reset ${personName}'s portal password?`}
        description="A new temporary password will replace the current one and sign them out everywhere. Their account, ID and links stay exactly as they are."
        confirmLabel="Reset password"
        loading={resetting}
        onConfirm={confirm}
        onCancel={() => setConfirming(false)}
      />
    </Card>
  );
}
