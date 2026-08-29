"use client";

import { use, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useAuth, ApiError } from "@/lib/auth-context";
import { api, type School } from "@/lib/api";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { FormField, Input } from "@/components/ui/FormControls";
import { SkeletonCards } from "@/components/ui/Skeleton";
import { ArrowRight, GraduationCap, Mail } from "lucide-react";

export default function SchoolDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { user, accessToken } = useAuth();

  const [school, setSchool] = useState<School | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [email, setEmail] = useState("");
  const [acceptUrl, setAcceptUrl] = useState<string | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!accessToken) return;
    api
      .getSchool(accessToken, id)
      .then(setSchool)
      .catch((err) => setLoadError(err instanceof ApiError ? err.message : "Failed to load school"));
  }, [accessToken, id]);

  async function onInvite(e: FormEvent) {
    e.preventDefault();
    if (!accessToken) return;
    setInviteError(null);
    setAcceptUrl(null);
    setSubmitting(true);
    try {
      const result = await api.inviteSchoolAdmin(accessToken, id, email);
      setAcceptUrl(result.acceptUrl);
      setEmail("");
    } catch (err) {
      setInviteError(err instanceof ApiError ? err.message : "Failed to send invitation");
    } finally {
      setSubmitting(false);
    }
  }

  if (loadError) {
    return (
      <div className="p-4 sm:p-6">
        <Alert tone="danger">{loadError}</Alert>
      </div>
    );
  }
  if (!school) {
    return (
      <div className="p-4 sm:p-6">
        <SkeletonCards count={2} />
      </div>
    );
  }

  const canManage = user?.permissions.includes("schools.manage") ?? false;

  return (
    <div>
      <PageHeader
        eyebrow="School"
        title={school.name}
        breadcrumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Schools", href: "/schools" },
          { label: school.name },
        ]}
        actions={<Badge tone={school.status === "ACTIVE" ? "success" : "neutral"}>{school.status}</Badge>}
      />

      <div className="mx-auto max-w-2xl space-y-5 p-4 sm:p-6">
        <Card>
          <p className="text-sm text-foreground-soft">{school.type.replace(/_/g, " ")}</p>
          {school.address && <p className="mt-1 text-sm text-foreground-soft">{school.address}</p>}
        </Card>

        {user?.permissions.includes("academic.view") && (
          <Link href={`/schools/${school.id}/dashboard`}>
            <Card className="flex items-center justify-between transition-colors hover:border-accent">
              <div className="flex items-center gap-3">
                <div className="flex size-9 items-center justify-center rounded-lg bg-accent-soft text-accent">
                  <GraduationCap className="size-4.5" />
                </div>
                <span className="font-medium text-foreground">Open school dashboard</span>
              </div>
              <ArrowRight className="size-4 text-foreground-muted" />
            </Card>
          </Link>
        )}

        {canManage && (
          <Card padding="none">
            <div className="border-b border-border px-5 py-4">
              <h2 className="text-sm font-semibold text-foreground">Invite a School Admin</h2>
              <p className="mt-1 text-sm text-foreground-soft">
                Creates a pending account scoped to this school only — no password is set until they accept.
              </p>
            </div>
            <form onSubmit={onInvite} className="p-5">
              <FormField label="Email" htmlFor="email" required>
                <Input
                  id="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@example.school"
                />
              </FormField>

              {inviteError && (
                <Alert tone="danger" className="mt-3">
                  {inviteError}
                </Alert>
              )}

              {acceptUrl && (
                <Alert tone="success" className="mt-3">
                  <p className="font-medium">Invitation created.</p>
                  <p className="mt-1 break-all font-mono text-xs">{acceptUrl}</p>
                  <p className="mt-1 flex items-center gap-1.5 text-foreground-soft">
                    <Mail className="size-3.5" /> Email delivery isn&apos;t wired up yet — share this link with them directly for now.
                  </p>
                </Alert>
              )}

              <Button type="submit" loading={submitting} className="mt-4">
                Send invitation
              </Button>
            </form>
          </Card>
        )}
      </div>
    </div>
  );
}
