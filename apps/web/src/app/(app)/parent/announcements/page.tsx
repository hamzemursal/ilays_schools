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
import { soDate } from "@/features/parent-portal/so";

export default function ParentAnnouncementsPage() {
  const { accessToken } = useAuth();
  const [announcements, setAnnouncements] = useState<Announcement[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken) return;
    api
      .listMyAnnouncements(accessToken)
      .then(setAnnouncements)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Lama soo rarin ogeysiisyada"));
  }, [accessToken]);

  return (
    <div>
      <PageHeader variant="plain" eyebrow="Portal-ka Waalidka" title="Ogeysiisyada" description="Ogeysiisyada dugsiga ee waalidiinta." />

      <div className="space-y-3 px-3 pb-8 pt-4 sm:px-5">
        {error ? (
          <Alert tone="danger">{error}</Alert>
        ) : !announcements ? (
          <SkeletonCards count={3} />
        ) : announcements.length === 0 ? (
          <Card className="rounded-2xl">
            <EmptyState icon={Megaphone} title="Weli ogeysiis lama soo dhigin" />
          </Card>
        ) : (
          announcements.map((a) => (
            <Card key={a.id} className="relative overflow-hidden rounded-2xl pl-6">
              <span className="absolute inset-y-0 left-0 w-1.5 bg-accent" aria-hidden />
              <div className="flex flex-wrap items-start justify-between gap-2">
                <p className="flex items-center gap-2 font-semibold text-foreground">
                  <span className="flex size-8 items-center justify-center rounded-lg bg-accent-soft text-accent">
                    <Megaphone className="size-4" />
                  </span>
                  {a.title}
                </p>
                <div className="flex items-center gap-2">
                  {a.school && <Badge tone="accent">{a.school.name}</Badge>}
                  <span className="text-xs text-foreground-muted">{soDate(a.createdAt)}</span>
                </div>
              </div>
              <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-foreground-soft">{a.body}</p>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
