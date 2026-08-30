"use client";

import { useEffect, useState } from "react";
import { useAuth, ApiError } from "@/lib/auth-context";
import { api, type MyGuardianProfile } from "@/lib/api";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Alert } from "@/components/ui/Alert";
import { SkeletonCards } from "@/components/ui/Skeleton";
import { Mail, Phone, User } from "lucide-react";

export default function ParentProfilePage() {
  const { accessToken } = useAuth();
  const [profile, setProfile] = useState<MyGuardianProfile | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken) return;
    api
      .getMyParentProfile(accessToken)
      .then(setProfile)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load your profile"));
  }, [accessToken]);

  return (
    <div>
      <PageHeader eyebrow="Parent Portal" title="Profile" description="Your account details on file with the school." />

      <div className="p-4 sm:p-6">
        {error ? (
          <Alert tone="danger">{error}</Alert>
        ) : !profile ? (
          <SkeletonCards count={1} />
        ) : (
          <Card className="max-w-lg">
            <div className="flex items-center gap-4">
              <div className="flex size-14 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent">
                <User className="size-6" />
              </div>
              <div>
                <p className="text-lg font-semibold text-foreground">
                  {profile.firstName} {profile.lastName}
                </p>
                {profile.guardianCode && <p className="font-mono text-xs text-foreground-muted">{profile.guardianCode}</p>}
              </div>
            </div>

            <div className="mt-5 space-y-3 border-t border-border pt-4">
              {profile.phone && (
                <p className="flex items-center gap-2 text-sm text-foreground-soft">
                  <Phone className="size-4 text-foreground-muted" /> {profile.phone}
                </p>
              )}
              {(profile.email ?? profile.user?.email) && (
                <p className="flex items-center gap-2 text-sm text-foreground-soft">
                  <Mail className="size-4 text-foreground-muted" /> {profile.email ?? profile.user?.email}
                </p>
              )}
              {profile.address && <p className="text-sm text-foreground-soft">{profile.address}</p>}
            </div>

            <div className="mt-4 flex gap-2 border-t border-border pt-4">
              <Badge tone={profile.status === "ACTIVE" ? "success" : "neutral"}>{profile.status}</Badge>
              {profile.user && <Badge tone="accent">Portal account {profile.user.status}</Badge>}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
