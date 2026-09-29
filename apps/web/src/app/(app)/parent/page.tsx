"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { api, type MyGuardianProfile } from "@/lib/api";
import { useSelectedChild } from "@/features/parent-portal/SelectedChildContext";
import { ChildCard, StatTile } from "@/features/parent-portal/ParentUI";
import { PageHeader } from "@/components/ui/PageHeader";
import { Alert } from "@/components/ui/Alert";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { SkeletonCards } from "@/components/ui/Skeleton";
import { GraduationCap, School as SchoolIcon, Star, Users } from "lucide-react";

export default function ParentDashboardPage() {
  const { accessToken, user } = useAuth();
  const { children, loading, error, setSelectedChildId } = useSelectedChild();
  const [profile, setProfile] = useState<MyGuardianProfile | null>(null);

  useEffect(() => {
    if (!accessToken) return;
    api.getMyParentProfile(accessToken).then(setProfile).catch(() => undefined);
  }, [accessToken]);

  const name = profile ? `${profile.firstName} ${profile.lastName}` : (user?.email ?? "");
  const schools = new Set(children.map((c) => c.enrollment?.schoolName).filter(Boolean));
  const enrolled = children.filter((c) => c.enrollment).length;

  return (
    <div>
      <PageHeader
        variant="plain"
        eyebrow="Portal-ka Waalidka"
        title={`Ku soo dhawoow, ${name}`}
        description="Halkan waxaad ka aragtaa carruurtaada, natiijooyinkooda, xaadiriskooda iyo lacagahooda."
      />

      <div className="space-y-5 px-3 pb-8 pt-4 sm:px-5">
        {error ? (
          <Alert tone="danger">{error}</Alert>
        ) : loading ? (
          <SkeletonCards count={3} />
        ) : children.length === 0 ? (
          <Card className="rounded-2xl">
            <EmptyState
              icon={Users}
              title="Weli ilmo laguma xirin akoonkaaga"
              description="Maamulka dugsiga ka codso inay akoonkaaga ku xiraan xogta ilmahaaga."
            />
          </Card>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <StatTile icon={Users} tone="bg-accent-soft text-accent" label="Carruurta" value={children.length} />
              <StatTile icon={GraduationCap} tone="bg-violet-50 text-violet-600" label="Kuwa hadda dhigta" value={enrolled} />
              <StatTile icon={SchoolIcon} tone="bg-teal-50 text-teal-600" label="Dugsiyada" value={schools.size} />
            </div>

            <section aria-label="Carruurtayda">
              <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-foreground-soft">
                <Star className="size-4 text-accent" /> Carruurtayda
              </h2>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                {children.map((c, i) => (
                  <ChildCard key={c.studentId} child={c} index={i} quickLinks onSelect={() => setSelectedChildId(c.studentId)} />
                ))}
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
}
