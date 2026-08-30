"use client";

import { useEffect, useState } from "react";
import { useAuth, ApiError } from "@/lib/auth-context";
import { api, type MyChildProfile } from "@/lib/api";
import { useSelectedChild } from "@/features/parent-portal/SelectedChildContext";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { EmptyState } from "@/components/ui/EmptyState";
import { SkeletonCards } from "@/components/ui/Skeleton";
import { Cake, GraduationCap, User, Users } from "lucide-react";

export default function MyChildrenPage() {
  const { accessToken } = useAuth();
  const { children, loading, error, selectedChildId, setSelectedChildId } = useSelectedChild();

  return (
    <div>
      <PageHeader eyebrow="Parent Portal" title="My Children" description="All students linked to your account." />

      <div className="space-y-5 p-4 sm:p-6">
        {error ? (
          <Alert tone="danger">{error}</Alert>
        ) : loading ? (
          <SkeletonCards count={3} />
        ) : children.length === 0 ? (
          <EmptyState icon={Users} title="No children linked yet" />
        ) : (
          <>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {children.map((c) => (
                <Card key={c.studentId} className={c.studentId === selectedChildId ? "ring-2 ring-accent" : undefined}>
                  <p className="font-semibold text-foreground">
                    {c.firstName} {c.lastName}
                  </p>
                  {c.enrollment ? (
                    <p className="mt-0.5 text-sm text-foreground-soft">
                      {c.enrollment.className} · {c.enrollment.sectionName}
                    </p>
                  ) : (
                    <p className="mt-0.5 text-sm text-foreground-muted">Not currently enrolled</p>
                  )}
                  {c.enrollment && <p className="mt-0.5 text-xs text-foreground-muted">{c.enrollment.academicYearName}</p>}
                  <Button
                    size="sm"
                    variant={c.studentId === selectedChildId ? "primary" : "outline"}
                    className="mt-4 w-full"
                    onClick={() => setSelectedChildId(c.studentId)}
                  >
                    {c.studentId === selectedChildId ? "Selected" : "View Student"}
                  </Button>
                </Card>
              ))}
            </div>

            {selectedChildId && accessToken && (
              <ChildProfileCard key={selectedChildId} accessToken={accessToken} studentId={selectedChildId} />
            )}
          </>
        )}
      </div>
    </div>
  );
}

function ChildProfileCard({ accessToken, studentId }: { accessToken: string; studentId: string }) {
  const [profile, setProfile] = useState<MyChildProfile | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .getMyChild(accessToken, studentId)
      .then(setProfile)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load student profile"));
    api
      .getMyChildPhotoUrl(accessToken, studentId)
      .then((res) => setPhotoUrl(res.url))
      .catch(() => setPhotoUrl(null));
  }, [accessToken, studentId]);

  if (error) return <Alert tone="danger">{error}</Alert>;
  if (!profile) return <SkeletonCards count={1} />;

  const activeEnrollment = profile.enrollments.find((e) => e.status === "ACTIVE") ?? profile.enrollments[0];

  return (
    <Card padding="none">
      <CardHeader title="Student profile" />
      <div className="flex flex-wrap items-center gap-4 p-5">
        <div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-full bg-accent-soft text-accent">
          {photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photoUrl} alt={`${profile.firstName} ${profile.lastName}`} className="size-full object-cover" />
          ) : (
            <User className="size-7" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-lg font-semibold text-foreground">
            {profile.firstName} {profile.lastName}
          </p>
          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-foreground-soft">
            <span className="inline-flex items-center gap-1.5">
              <Cake className="size-3.5" /> {new Date(profile.dateOfBirth).toLocaleDateString()}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <User className="size-3.5" /> {profile.sex === "MALE" ? "Male" : "Female"}
            </span>
            {activeEnrollment && (
              <span className="font-mono text-xs text-foreground-muted">#{activeEnrollment.studentNumber}</span>
            )}
          </div>
          <div className="mt-2">
            <Badge tone={profile.currentStatus === "ACTIVE" ? "success" : "neutral"}>{profile.currentStatus}</Badge>
          </div>
        </div>
      </div>

      {activeEnrollment && (
        <div className="grid grid-cols-2 gap-4 border-t border-border p-5 sm:grid-cols-4">
          <Field icon={GraduationCap} label="School" value={activeEnrollment.school.name} />
          <Field label="Academic Year" value={activeEnrollment.academicYear.name} />
          <Field label="Class" value={activeEnrollment.class.name} />
          <Field label="Section" value={activeEnrollment.section.name} />
        </div>
      )}
    </Card>
  );
}

function Field({ icon: Icon, label, value }: { icon?: React.ComponentType<{ className?: string }>; label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-foreground-muted">{label}</p>
      <p className="mt-0.5 flex items-center gap-1.5 text-sm font-medium text-foreground">
        {Icon && <Icon className="size-3.5 text-foreground-muted" />}
        {value}
      </p>
    </div>
  );
}
