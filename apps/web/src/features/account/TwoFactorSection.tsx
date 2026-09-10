"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Check, Copy, ShieldCheck, ShieldOff } from "lucide-react";
import { ApiError } from "@/lib/auth-context";
import { api } from "@/lib/api";
import { Card, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { FormField, Input } from "@/components/ui/FormControls";
import { Skeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";

type Step = "idle" | "confirm" | "recovery-codes" | "disable";

export function TwoFactorSection({
  accessToken,
  forced,
  onEnabled,
}: {
  accessToken: string;
  // Skips the "not enabled, click to start" idle state and jumps straight
  // into setup on mount, with no way to back out — used by AppShell's
  // mandatory gate for Super/Org Admins, never the ordinary My Account flow.
  forced?: boolean;
  onEnabled?: () => void;
}) {
  const { show } = useToast();
  const [status, setStatus] = useState<{ enabled: boolean } | null>(null);
  const [step, setStep] = useState<Step>("idle");
  const [setup, setSetup] = useState<{ secret: string; qrCodeDataUri: string } | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const [savedConfirmed, setSavedConfirmed] = useState(false);
  const [password, setPassword] = useState("");
  const [copied, setCopied] = useState(false);

  function load() {
    api.getTotpStatus(accessToken).then(setStatus).catch(() => setStatus({ enabled: false }));
  }
  useEffect(() => {
    if (forced) {
      startEnable();
    } else {
      load();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken]);

  function closeDialog() {
    setStep("idle");
    setSetup(null);
    setCode("");
    setPassword("");
    setError(null);
    setSavedConfirmed(false);
  }

  async function startEnable() {
    setError(null);
    try {
      const s = await api.setupTotp(accessToken);
      setSetup(s);
      setStep("confirm");
    } catch (err) {
      show(err instanceof ApiError ? err.message : "Couldn't start setup", "danger");
    }
  }

  async function confirmEnable(e: FormEvent) {
    e.preventDefault();
    if (!setup) return;
    setError(null);
    setSubmitting(true);
    try {
      const { recoveryCodes: codes } = await api.enableTotp(accessToken, setup.secret, code);
      setRecoveryCodes(codes);
      setStep("recovery-codes");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't confirm that code");
    } finally {
      setSubmitting(false);
    }
  }

  function finishEnable() {
    closeDialog();
    setRecoveryCodes(null);
    if (forced) {
      onEnabled?.();
    } else {
      load();
      show("Two-factor authentication enabled.");
    }
  }

  async function confirmDisable(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await api.disableTotp(accessToken, password);
      closeDialog();
      load();
      show("Two-factor authentication disabled.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't disable two-factor authentication");
    } finally {
      setSubmitting(false);
    }
  }

  function copySecret() {
    if (!setup) return;
    navigator.clipboard.writeText(setup.secret).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  function copyRecoveryCodes() {
    if (!recoveryCodes) return;
    navigator.clipboard.writeText(recoveryCodes.join("\n")).then(() => show("Recovery codes copied."));
  }

  if (forced) {
    return (
      <div>
        {step === "confirm" && setup && (
          <SetupConfirmForm
            setup={setup}
            code={code}
            setCode={setCode}
            error={error}
            submitting={submitting}
            copied={copied}
            onCopySecret={copySecret}
            onSubmit={confirmEnable}
          />
        )}
        {step === "recovery-codes" && recoveryCodes && (
          <RecoveryCodesDisplay
            codes={recoveryCodes}
            savedConfirmed={savedConfirmed}
            onSavedConfirmedChange={setSavedConfirmed}
            onCopyAll={copyRecoveryCodes}
            onDone={finishEnable}
          />
        )}
      </div>
    );
  }

  return (
    <Card>
      <CardHeader
        title="Two-factor authentication"
        description="Require a code from an authenticator app, in addition to your password, when signing in."
      />

      {!status ? (
        <Skeleton className="h-9 w-40" />
      ) : status.enabled ? (
        <div className="flex flex-wrap items-center gap-3">
          <Badge tone="success">
            <ShieldCheck className="size-3.5" />
            Enabled
          </Badge>
          <Button variant="outline" size="sm" onClick={() => setStep("disable")}>
            Disable
          </Button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <Badge tone="neutral">
            <ShieldOff className="size-3.5" />
            Not enabled
          </Badge>
          <Button size="sm" onClick={startEnable}>
            Enable
          </Button>
        </div>
      )}

      {step === "confirm" && setup && (
        <Dialog onClose={closeDialog}>
          <SetupConfirmForm
            setup={setup}
            code={code}
            setCode={setCode}
            error={error}
            submitting={submitting}
            copied={copied}
            onCopySecret={copySecret}
            onSubmit={confirmEnable}
            onCancel={closeDialog}
          />
        </Dialog>
      )}

      {step === "recovery-codes" && recoveryCodes && (
        <Dialog onClose={() => {}}>
          <RecoveryCodesDisplay
            codes={recoveryCodes}
            savedConfirmed={savedConfirmed}
            onSavedConfirmedChange={setSavedConfirmed}
            onCopyAll={copyRecoveryCodes}
            onDone={finishEnable}
          />
        </Dialog>
      )}

      {step === "disable" && (
        <Dialog onClose={closeDialog}>
          <h2 className="font-semibold text-foreground">Disable two-factor authentication</h2>
          <p className="mt-1 text-sm text-foreground-soft">
            Confirm your password to turn this off. Your recovery codes will stop working.
          </p>
          <form onSubmit={confirmDisable} className="mt-4">
            <FormField label="Current password" htmlFor="totp-disable-password" required>
              <Input
                id="totp-disable-password"
                type="password"
                autoFocus
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
              />
            </FormField>
            {error && (
              <Alert tone="danger" className="mt-3">
                {error}
              </Alert>
            )}
            <div className="mt-4 flex justify-end gap-2">
              <Button type="button" variant="outline" size="sm" onClick={closeDialog} disabled={submitting}>
                Cancel
              </Button>
              <Button type="submit" variant="danger" size="sm" loading={submitting}>
                Disable
              </Button>
            </div>
          </form>
        </Dialog>
      )}
    </Card>
  );
}

function SetupConfirmForm({
  setup,
  code,
  setCode,
  error,
  submitting,
  copied,
  onCopySecret,
  onSubmit,
  onCancel,
}: {
  setup: { secret: string; qrCodeDataUri: string };
  code: string;
  setCode: (v: string) => void;
  error: string | null;
  submitting: boolean;
  copied: boolean;
  onCopySecret: () => void;
  onSubmit: (e: FormEvent) => void;
  // Omitted entirely in forced mode — a mandatory setup has nothing to
  // cancel back to.
  onCancel?: () => void;
}) {
  return (
    <>
      <h2 className="font-semibold text-foreground">Scan this QR code</h2>
      <p className="mt-1 text-sm text-foreground-soft">
        Use an authenticator app (Google Authenticator, Authy, 1Password, …) to scan it, or enter the code below
        manually.
      </p>
      <div className="mt-4 flex justify-center">
        {/* eslint-disable-next-line @next/next/no-img-element -- generated data URI, not a static/remote asset */}
        <img src={setup.qrCodeDataUri} alt="Two-factor authentication QR code" className="size-44 rounded-lg border border-border" />
      </div>
      <div className="mt-3 flex items-center justify-center gap-2">
        <code className="rounded-md bg-surface-soft px-2.5 py-1.5 font-mono text-xs tracking-wider text-foreground">
          {setup.secret}
        </code>
        <button
          type="button"
          onClick={onCopySecret}
          aria-label="Copy secret"
          className="rounded-md p-1.5 text-foreground-muted hover:bg-surface-hover hover:text-foreground"
        >
          {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
        </button>
      </div>

      <form onSubmit={onSubmit} className="mt-5">
        <FormField label="Enter the 6-digit code from your app" htmlFor="totp-setup-code" required>
          <Input
            id="totp-setup-code"
            type="text"
            inputMode="numeric"
            autoFocus
            required
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="123456"
          />
        </FormField>
        {error && (
          <Alert tone="danger" className="mt-3">
            {error}
          </Alert>
        )}
        <div className="mt-4 flex justify-end gap-2">
          {onCancel && (
            <Button type="button" variant="outline" size="sm" onClick={onCancel} disabled={submitting}>
              Cancel
            </Button>
          )}
          <Button type="submit" size="sm" loading={submitting}>
            Confirm
          </Button>
        </div>
      </form>
    </>
  );
}

function RecoveryCodesDisplay({
  codes,
  savedConfirmed,
  onSavedConfirmedChange,
  onCopyAll,
  onDone,
}: {
  codes: string[];
  savedConfirmed: boolean;
  onSavedConfirmedChange: (v: boolean) => void;
  onCopyAll: () => void;
  onDone: () => void;
}) {
  return (
    <>
      <h2 className="font-semibold text-foreground">Save your recovery codes</h2>
      <p className="mt-1 text-sm text-foreground-soft">
        Each code can be used once to sign in if you lose access to your authenticator app. They won&apos;t be shown
        again — save them somewhere safe.
      </p>
      <div className="mt-4 grid grid-cols-2 gap-2 rounded-lg border border-border bg-surface-soft p-3 font-mono text-sm">
        {codes.map((c) => (
          <span key={c} className="text-foreground">
            {c}
          </span>
        ))}
      </div>
      <Button variant="outline" size="sm" icon={<Copy className="size-4" />} className="mt-3" onClick={onCopyAll}>
        Copy all
      </Button>

      <label className="mt-5 flex items-start gap-2.5 text-sm text-foreground-soft">
        <input
          type="checkbox"
          checked={savedConfirmed}
          onChange={(e) => onSavedConfirmedChange(e.target.checked)}
          className="mt-0.5"
        />
        I&apos;ve saved these recovery codes somewhere safe.
      </label>

      <div className="mt-4 flex justify-end">
        <Button size="sm" disabled={!savedConfirmed} onClick={onDone}>
          Done
        </Button>
      </div>
    </>
  );
}

function Dialog({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/30 px-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-xl border border-border bg-background p-5 shadow-lg"
      >
        {children}
      </div>
    </div>
  );
}
