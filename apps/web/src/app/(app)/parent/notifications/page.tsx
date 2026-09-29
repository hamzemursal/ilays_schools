"use client";

import { useEffect, useState } from "react";
import { useAuth, ApiError } from "@/lib/auth-context";
import { api, type NotificationItem } from "@/lib/api";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { EmptyState } from "@/components/ui/EmptyState";
import { SkeletonCards } from "@/components/ui/Skeleton";
import { Bell, Check } from "lucide-react";
import { soDate } from "@/features/parent-portal/so";

export default function ParentNotificationsPage() {
  const { accessToken } = useAuth();
  const [notifications, setNotifications] = useState<NotificationItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [markingId, setMarkingId] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken) return;
    api
      .listMyNotifications(accessToken)
      .then(setNotifications)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Lama soo rarin fariimaha"));
  }, [accessToken]);

  async function onMarkRead(id: string) {
    if (!accessToken) return;
    setMarkingId(id);
    try {
      const updated = await api.markNotificationRead(accessToken, id);
      setNotifications((prev) => prev?.map((n) => (n.id === id ? updated : n)) ?? prev);
    } finally {
      setMarkingId(null);
    }
  }

  return (
    <div>
      <PageHeader variant="plain" eyebrow="Portal-ka Waalidka" title="Fariimaha" description="War-bixinno ku saabsan adiga iyo carruurtaada." />

      <div className="space-y-3 px-3 pb-8 pt-4 sm:px-5">
        {error ? (
          <Alert tone="danger">{error}</Alert>
        ) : !notifications ? (
          <SkeletonCards count={3} />
        ) : notifications.length === 0 ? (
          <Card className="rounded-2xl">
            <EmptyState icon={Bell} title="Weli fariin ma jirto" />
          </Card>
        ) : (
          notifications.map((n) => (
            <Card key={n.id} className={`rounded-2xl ${n.isRead ? "" : "border-accent/40 bg-accent-soft/30"}`}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <p className="flex items-center gap-2 font-medium text-foreground">
                  {!n.isRead && <span className="size-2 shrink-0 rounded-full bg-accent" aria-label="Aan la akhrin" />}
                  {n.title}
                </p>
                <span className="text-xs text-foreground-muted">{soDate(n.createdAt)}</span>
              </div>
              <p className="mt-1 text-sm text-foreground-soft">{n.body}</p>
              {!n.isRead && (
                <Button
                  size="sm"
                  variant="outline"
                  icon={<Check className="size-4" />}
                  loading={markingId === n.id}
                  onClick={() => onMarkRead(n.id)}
                  className="mt-3"
                >
                  Calaamadee inaan akhriyay
                </Button>
              )}
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
