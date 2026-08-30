"use client";

import { useEffect, useState } from "react";
import { useAuth, ApiError } from "@/lib/auth-context";
import { api, type Announcement } from "@/lib/api";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Alert } from "@/components/ui/Alert";
import { EmptyState } from "@/components/ui/EmptyState";
import { SkeletonCards } from "@/components/ui/Skeleton";
import { Megaphone } from "lucide-react";

export default function ParentAnnouncementsPage() {
  const { accessToken } = useAuth();
  const [announcements, setAnnouncements] = useState<Announcement[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken) return;
    api
      .listMyAnnouncements(accessToken)
      .then(setAnnouncements)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load announcements"));
  }, [accessToken]);

  return (
    <div>
      <PageHeader eyebrow="Parent Portal" title="Announcements" description="School announcements for parents." />

      <div className="space-y-3 p-4 sm:p-6">
        {error ? (
          <Alert tone="danger">{error}</Alert>
        ) : !announcements ? (
          <SkeletonCards count={3} />
        ) : announcements.length === 0 ? (
          <EmptyState icon={Megaphone} title="No announcements yet" />
        ) : (
          announcements.map((a) => (
            <Card key={a.id}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <p className="font-semibold text-foreground">{a.title}</p>
                <div className="flex items-center gap-2">
                  {a.school && <Badge tone="accent">{a.school.name}</Badge>}
                  <span className="text-xs text-foreground-muted">{new Date(a.createdAt).toLocaleDateString()}</span>
                </div>
              </div>
              <p className="mt-2 whitespace-pre-wrap text-sm text-foreground-soft">{a.body}</p>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
