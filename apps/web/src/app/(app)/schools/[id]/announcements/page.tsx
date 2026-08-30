"use client";

import { use, useEffect, useState, type FormEvent } from "react";
import { useAuth, ApiError } from "@/lib/auth-context";
import { api, type Announcement, type AnnouncementAudience } from "@/lib/api";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { EmptyState } from "@/components/ui/EmptyState";
import { FormField, Input, Select, Textarea } from "@/components/ui/FormControls";
import { SkeletonCards } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import { Megaphone, Plus } from "lucide-react";

const AUDIENCE_LABEL: Record<AnnouncementAudience, string> = {
  ALL: "Everyone",
  PARENTS: "Parents only",
  TEACHERS: "Teachers only",
};

export default function AnnouncementsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: schoolId } = use(params);
  const { user, accessToken } = useAuth();
  const { show } = useToast();

  const [announcements, setAnnouncements] = useState<Announcement[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [audience, setAudience] = useState<AnnouncementAudience>("ALL");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

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

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!accessToken) return;
    setSaving(true);
    setFormError(null);
    try {
      await api.createAnnouncement(accessToken, schoolId, { title, body, audience });
      show("Announcement posted.");
      setTitle("");
      setBody("");
      setAudience("ALL");
      setCreating(false);
      load();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Failed to post announcement");
    } finally {
      setSaving(false);
    }
  }

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
            <form onSubmit={onSubmit} className="space-y-4 p-5">
              <FormField label="Title" required>
                <Input required value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Mid-term break" />
              </FormField>
              <FormField label="Message" required>
                <Textarea required rows={4} value={body} onChange={(e) => setBody(e.target.value)} />
              </FormField>
              <FormField label="Audience" hint="Who this announcement is delivered to.">
                <Select value={audience} onChange={(e) => setAudience(e.target.value as AnnouncementAudience)}>
                  <option value="ALL">Everyone</option>
                  <option value="PARENTS">Parents only</option>
                  <option value="TEACHERS">Teachers only</option>
                </Select>
              </FormField>
              {formError && <Alert tone="danger">{formError}</Alert>}
              <div className="flex gap-2">
                <Button type="submit" size="sm" loading={saving}>
                  Post announcement
                </Button>
                <Button type="button" size="sm" variant="outline" onClick={() => setCreating(false)}>
                  Cancel
                </Button>
              </div>
            </form>
          </Card>
        )}

        {error ? (
          <Alert tone="danger">{error}</Alert>
        ) : !announcements ? (
          <SkeletonCards count={3} />
        ) : announcements.length === 0 ? (
          <EmptyState icon={Megaphone} title="No announcements yet" description="Post one to notify parents and staff." />
        ) : (
          <div className="space-y-3">
            {announcements.map((a) => (
              <Card key={a.id}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <p className="font-semibold text-foreground">{a.title}</p>
                  <div className="flex items-center gap-2">
                    <Badge tone="accent">{AUDIENCE_LABEL[a.audience]}</Badge>
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
