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
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load notifications"));
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
      <PageHeader eyebrow="Parent Portal" title="Notifications" description="Updates relevant to you and your children." />

      <div className="space-y-3 p-4 sm:p-6">
        {error ? (
          <Alert tone="danger">{error}</Alert>
        ) : !notifications ? (
          <SkeletonCards count={3} />
        ) : notifications.length === 0 ? (
          <EmptyState icon={Bell} title="No notifications yet" />
        ) : (
          notifications.map((n) => (
            <Card key={n.id} className={n.isRead ? undefined : "border-accent/40 bg-accent-soft/40"}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <p className="font-medium text-foreground">{n.title}</p>
                <span className="text-xs text-foreground-muted">{new Date(n.createdAt).toLocaleDateString()}</span>
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
                  Mark as read
                </Button>
              )}
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
