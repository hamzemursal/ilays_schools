"use client";

import { use, useEffect, useState } from "react";
import { useAuth, ApiError } from "@/lib/auth-context";
import { api, type Announcement } from "@/lib/api";
import { AUDIENCE_LABEL, AnnouncementComposer } from "@/features/announcements/AnnouncementComposer";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { EmptyState } from "@/components/ui/EmptyState";
import { SkeletonCards } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import { Megaphone, Plus, Users } from "lucide-react";

// "Form 3 · Section B · 2029-2030", or nothing for a school-wide announcement.
function scopeLabel(a: Announcement) {
  if (!a.class) return null;
  return [a.class.name, a.section ? `Section ${a.section.name}` : null, a.academicYear?.name].filter(Boolean).join(" · ");
}

export default function AnnouncementsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: schoolId } = use(params);
  const { user, accessToken } = useAuth();
  const { show } = useToast();

  const [announcements, setAnnouncements] = useState<Announcement[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);


  function load() {
    if (!accessToken) return;
    api
      .listAnnouncements(accessToken, schoolId)
      .then(setAnnouncements)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load announcements"));
  }

  useEffect(load, [accessToken, schoolId]);

  const canManage = user?.permissions.includes("announcements.manage") ?? false;
  const schoolName = user?.schools.find((s) => s.id === schoolId)?.name ?? "School";

  return (
    <div>
      <PageHeader
        eyebrow="Announcements"
        title={schoolName}
        breadcrumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "Announcements" }]}
        actions={
          canManage &&
          !creating && (
            <Button icon={<Plus className="size-4" />} onClick={() => setCreating(true)}>
              New Announcement
            </Button>
          )
        }
      />

      <div className="space-y-5 p-4 sm:p-6">
        {creating && (
          <Card padding="none">
            <CardHeader title="New announcement" />
            <AnnouncementComposer
              accessToken={accessToken!}
              schoolId={schoolId}
              onCancel={() => setCreating(false)}
              onPosted={() => {
                show("Announcement posted.");
                setCreating(false);
                load();
              }}
            />
          </Card>
        )}

        {error ? (
          <Alert tone="danger">{error}</Alert>
        ) : !announcements ? (
          <SkeletonCards count={3} />
        ) : announcements.length === 0 ? (
          <EmptyState icon={Megaphone} title="No announcements yet" description="Post one to notify students, parents, teachers or staff." />
        ) : (
          <div className="space-y-3">
            {announcements.map((a) => (
              <Card key={a.id}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <p className="font-semibold text-foreground">{a.title}</p>
                  <div className="flex items-center gap-2">
                    <Badge tone="accent">{AUDIENCE_LABEL[a.audience] ?? a.audience}</Badge>
                    {scopeLabel(a) && <Badge tone="neutral">{scopeLabel(a)}</Badge>}
                    {a.recipientCount != null && (
                      <span className="inline-flex items-center gap-1 text-xs text-foreground-muted">
                        <Users className="size-3.5" /> {a.recipientCount}
                      </span>
                    )}
                    <span className="text-xs text-foreground-muted">{new Date(a.createdAt).toLocaleDateString()}</span>
                  </div>
                </div>
                <p className="mt-2 whitespace-pre-wrap text-sm text-foreground-soft">{a.body}</p>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
