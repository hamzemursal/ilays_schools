"use client";

import { useAuth } from "@/lib/auth-context";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardHeader } from "@/components/ui/Card";
import { ChangePasswordForm } from "@/features/auth/ChangePasswordForm";
import { TwoFactorSection } from "./TwoFactorSection";

export function MyAccountPage() {
  const { user, accessToken } = useAuth();

  return (
    <div>
      <PageHeader eyebrow="Account" title="My Account" description="Manage your sign-in security." />

      <div className="max-w-lg space-y-5 p-4 sm:p-6">
        {user && (
          <Card padding="sm" className="text-sm">
            <p className="font-medium text-foreground">{user.email}</p>
            <p className="mt-0.5 text-foreground-muted">{user.roles.join(", ") || "No role"}</p>
          </Card>
        )}

        <Card>
          <CardHeader title="Password" description="Change the password used to sign in." />
          <ChangePasswordForm />
        </Card>

        {accessToken && <TwoFactorSection accessToken={accessToken} />}
      </div>
    </div>
  );
}
