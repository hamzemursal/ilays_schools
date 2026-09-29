"use client";

import { useEffect, useState } from "react";
import { useAuth, ApiError } from "@/lib/auth-context";
import { api, type MyChildProfile } from "@/lib/api";
import { useSelectedChild } from "@/features/parent-portal/SelectedChildContext";
import { ChildCard, initials } from "@/features/parent-portal/ParentUI";
import { SO_SEX, SO_STATUS, soDate, soStatus } from "@/features/parent-portal/so";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Alert } from "@/components/ui/Alert";
import { EmptyState } from "@/components/ui/EmptyState";
import { SkeletonCards } from "@/components/ui/Skeleton";
import { Cake, GraduationCap, Hash, School as SchoolIcon, User, Users } from "lucide-react";

export default function MyChildrenPage() {
  const { accessToken } = useAuth();
  const { children, loading, error, selectedChildId, setSelectedChildId } = useSelectedChild();

  return (
    <div>
      <PageHeader
        variant="plain"
        eyebrow="Portal-ka Waalidka"
        title="Carruurtayda"
        description="Dhammaan ardayda ku xiran akoonkaaga. Dooro ilmo si aad u aragto xogtiisa oo dhan."
      />

      <div className="space-y-5 px-3 pb-8 pt-4 sm:px-5">
        {error ? (
          <Alert tone="danger">{error}</Alert>
        ) : loading ? (
          <SkeletonCards count={3} />
        ) : children.length === 0 ? (
          <Card className="rounded-2xl">
            <EmptyState icon={Users} title="Weli ilmo laguma xirin akoonkaaga" />
          </Card>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {children.map((c, i) => (
                <ChildCard
                  key={c.studentId}
                  child={c}
                  index={i}
                  selected={c.studentId === selectedChildId}
                  onSelect={() => setSelectedChildId(c.studentId)}
                />
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
      .catch((err) => setError(err instanceof ApiError ? err.message : "Lama soo rarin xogta ardayga"));
    api
      .getMyChildPhotoUrl(accessToken, studentId)
      .then((res) => setPhotoUrl(res.url))
      .catch(() => setPhotoUrl(null));
  }, [accessToken, studentId]);

  if (error) return <Alert tone="danger">{error}</Alert>;
  if (!profile) return <SkeletonCards count={1} />;

  const activeEnrollment = profile.enrollments.find((e) => e.status === "ACTIVE") ?? profile.enrollments[0];
  const name = `${profile.firstName} ${profile.lastName}`;

  return (
    <Card padding="none" className="rounded-2xl">
      <CardHeader title="Xogta ardayga" description="Xogta ilmaha la doortay ee ku kaydsan dugsiga." />
      <div className="flex flex-wrap items-center gap-4 p-5">
        <div className="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-accent-soft text-2xl font-bold text-accent">
          {photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photoUrl} alt={name} className="size-full object-cover" />
          ) : (
            <span aria-hidden>{initials(name)}</span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xl font-semibold text-foreground">{name}</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-foreground-soft">
            <span className="inline-flex items-center gap-1.5">
              <Cake className="size-3.5" /> {soDate(profile.dateOfBirth)}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <User className="size-3.5" /> {SO_SEX[profile.sex] ?? profile.sex}
            </span>
            {activeEnrollment && (
              <span className="inline-flex items-center gap-1.5 font-mono text-xs">
                <Hash className="size-3.5" /> {activeEnrollment.studentNumber}
              </span>
            )}
          </div>
          <div className="mt-2">
            <Badge tone={profile.currentStatus === "ACTIVE" ? "success" : "neutral"}>{soStatus(SO_STATUS, profile.currentStatus)}</Badge>
          </div>
        </div>
      </div>

      {activeEnrollment && (
        <div className="grid grid-cols-2 gap-3 border-t border-border p-5 sm:grid-cols-4">
          <Field icon={SchoolIcon} label="Dugsiga" value={activeEnrollment.school.name} />
          <Field label="Sannad-dugsiyeedka" value={activeEnrollment.academicYear.name} />
          <Field icon={GraduationCap} label="Fasalka" value={activeEnrollment.class.name} />
          <Field label="Qaybta" value={activeEnrollment.section.name} />
        </div>
      )}
    </Card>
  );
}

function Field({ icon: Icon, label, value }: { icon?: React.ComponentType<{ className?: string }>; label: string; value: string }) {
  return (
    <div className="rounded-xl bg-surface-soft p-3">
      <p className="text-xs font-medium uppercase tracking-wide text-foreground-muted">{label}</p>
      <p className="mt-0.5 flex items-center gap-1.5 text-sm font-medium text-foreground">
        {Icon && <Icon className="size-3.5 text-foreground-muted" />}
        {value}
      </p>
    </div>
  );
}
