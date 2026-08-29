"use client";

import { useEffect, useState } from "react";
import { BookUser, Mail, Phone, Send } from "lucide-react";
import { ApiError, useAuth } from "@/lib/auth-context";
import type { Teacher } from "@/lib/api";
import { teachersApi } from "../api";
import { PhotoUpload } from "../components/PhotoUpload";
import { Card, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { EmptyState } from "@/components/ui/EmptyState";
import { SkeletonCards } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";

const STATUS_TONE: Record<Teacher["status"], "success" | "warning" | "neutral"> = {
  ACTIVE: "success",
  ON_LEAVE: "warning",
  INACTIVE: "neutral",
};

export function TeacherProfile({ schoolId, teacherId }: { schoolId: string; teacherId: string }) {
  const { user, accessToken } = useAuth();
  const { show } = useToast();

  const [teacher, setTeacher] = useState<Teacher | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [inviting, setInviting] = useState(false);

  useEffect(() => {
    if (!accessToken) return;
    teachersApi
      .list(accessToken, schoolId)
      .then((list) => {
        const found = list.find((t) => t.id === teacherId);
        if (!found) {
          setError("Teacher not found");
        } else {
          setTeacher(found);
        }
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load teacher"));
    teachersApi
      .getPhotoUrl(accessToken, schoolId, teacherId)
      .then((res) => setPhotoUrl(res.url))
      .catch(() => setPhotoUrl(null));
  }, [accessToken, schoolId, teacherId]);

  async function onInvite() {
    if (!accessToken || !teacher) return;
    setInviting(true);
    try {
      const result = await teachersApi.inviteLogin(accessToken, schoolId, teacher.id);
      show(`Invitation created for ${result.email}.`);
    } catch (err) {
      show(err instanceof ApiError ? err.message : "Failed to send invite", "danger");
    } finally {
      setInviting(false);
    }
  }

  if (error) return <Alert tone="danger">{error}</Alert>;
  if (!teacher) return <SkeletonCards count={2} />;

  const canUpdate = user?.permissions.includes("teachers.update") ?? false;

  return (
    <div className="space-y-5">
      <Card>
        <div className="flex flex-wrap items-center gap-4">
          {accessToken && (
            <PhotoUpload
              accessToken={accessToken}
              schoolId={schoolId}
              teacherId={teacher.id}
              name={`${teacher.firstName} ${teacher.lastName}`}
              canUpload={canUpdate}
              size="lg"
              photoUrl={photoUrl}
              onUploaded={setPhotoUrl}
            />
          )}
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-lg font-semibold text-foreground">
                {teacher.firstName} {teacher.lastName}
              </h1>
              <Badge tone={STATUS_TONE[teacher.status]}>{teacher.status.replace("_", " ")}</Badge>
            </div>
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-foreground-soft">
              <span className="font-mono text-xs text-foreground-muted">#{teacher.employeeNumber}</span>
              {teacher.phone && (
                <span className="inline-flex items-center gap-1.5">
                  <Phone className="size-3.5" /> {teacher.phone}
                </span>
              )}
              {teacher.email && (
                <span className="inline-flex items-center gap-1.5">
                  <Mail className="size-3.5" /> {teacher.email}
                </span>
              )}
            </div>
            {teacher.qualification && <p className="mt-1 text-sm text-foreground-soft">{teacher.qualification}</p>}
          </div>
          {canUpdate && !teacher.userId && (
            <Button size="sm" variant="outline" icon={<Send className="size-4" />} loading={inviting} onClick={onInvite}>
              Invite to log in
            </Button>
          )}
        </div>
      </Card>

      <Card padding="none">
        <CardHeader title="Assignments" description="Classes and subjects this teacher is assigned to." />
        <div className="p-5">
          {teacher.assignments.length === 0 ? (
            <EmptyState icon={BookUser} title="No assignments yet" description="Assign this teacher to a class and subject." />
          ) : (
            <div className="flex flex-wrap gap-2">
              {teacher.assignments.map((a) => (
                <Badge key={a.id} tone="accent">
                  {a.section.name} · {a.subject.name}
                </Badge>
              ))}
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
