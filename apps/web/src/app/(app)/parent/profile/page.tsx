"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth, ApiError } from "@/lib/auth-context";
import { api, type MyGuardianProfile } from "@/lib/api";
import { useSelectedChild } from "@/features/parent-portal/SelectedChildContext";
import { initials } from "@/features/parent-portal/ParentUI";
import { SO_RELATIONSHIP, SO_STATUS, soStatus } from "@/features/parent-portal/so";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Alert } from "@/components/ui/Alert";
import { SkeletonCards } from "@/components/ui/Skeleton";
import { KeyRound, Mail, MapPin, Phone, ShieldCheck, Users } from "lucide-react";

export default function ParentProfilePage() {
  const { accessToken } = useAuth();
  const { children } = useSelectedChild();
  const [profile, setProfile] = useState<MyGuardianProfile | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken) return;
    api
      .getMyParentProfile(accessToken)
      .then(setProfile)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Lama soo rarin xogtaada"));
  }, [accessToken]);

  const email = profile?.email ?? profile?.user?.email ?? null;

  return (
    <div>
      <PageHeader variant="plain" eyebrow="Portal-ka Waalidka" title="Xogtayda" description="Xogtaada ku kaydsan dugsiga." />

      <div className="space-y-5 px-3 pb-8 pt-4 sm:px-5">
        {error ? (
          <Alert tone="danger">{error}</Alert>
        ) : !profile ? (
          <SkeletonCards count={2} />
        ) : (
          <>
            <section aria-label="Waalidka" className="rounded-2xl border border-border bg-background p-5 shadow-sm">
              <div className="flex flex-wrap items-center gap-4">
                <span className="flex size-16 shrink-0 items-center justify-center rounded-2xl bg-accent text-xl font-bold text-white" aria-hidden>
                  {initials(`${profile.firstName} ${profile.lastName}`)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-xl font-semibold text-foreground">
                    {profile.firstName} {profile.lastName}
                  </p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-2">
                    {profile.guardianCode && (
                      <span className="rounded-md bg-accent-soft px-2 py-0.5 font-mono text-xs font-semibold text-accent">{profile.guardianCode}</span>
                    )}
                    <Badge tone={profile.status === "ACTIVE" ? "success" : "neutral"}>{soStatus(SO_STATUS, profile.status)}</Badge>
                    {profile.user && (
                      <Badge tone="accent">
                        <ShieldCheck className="size-3" /> Akoonka portal-ka: {soStatus(SO_STATUS, profile.user.status)}
                      </Badge>
                    )}
                  </div>
                </div>
              </div>
            </section>

            <Card padding="none" className="rounded-2xl">
              <CardHeader title="Xiriirka" description="Sida dugsigu kuula soo xiriiro." />
              <div className="grid grid-cols-1 gap-3 p-5 sm:grid-cols-3">
                <Field icon={Phone} tone="bg-accent-soft text-accent" label="Taleefanka" value={profile.phone ?? "—"} />
                <Field icon={Mail} tone="bg-teal-50 text-teal-600" label="Iimaylka" value={email ?? "—"} />
                <Field icon={MapPin} tone="bg-rose-50 text-rose-600" label="Cinwaanka" value={profile.address ?? "—"} />
              </div>
              <p className="px-5 pb-5 text-xs text-foreground-muted">Haddii xogtan ay khaldan tahay, la xiriir maamulka dugsiga.</p>
            </Card>

            <Card padding="none" className="rounded-2xl">
              <CardHeader title="Carruurta aan mas'uulka ka ahay" />
              {children.length === 0 ? (
                <p className="px-5 pb-5 text-sm text-foreground-muted">Weli ilmo laguma xirin akoonkaaga.</p>
              ) : (
                <ul className="divide-y divide-border">
                  {children.map((c) => (
                    <li key={c.studentId} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3">
                      <span className="flex items-center gap-2 text-sm font-medium text-foreground">
                        <Users className="size-4 text-foreground-muted" />
                        {c.firstName} {c.lastName}
                        {c.enrollment && (
                          <span className="font-normal text-foreground-soft">
                            · {c.enrollment.className} {c.enrollment.sectionName}
                          </span>
                        )}
                      </span>
                      <Badge tone="neutral">{soStatus(SO_RELATIONSHIP, c.relationship)}</Badge>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card className="rounded-2xl">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-foreground">Password-ka</p>
                  <p className="mt-0.5 text-sm text-foreground-soft">Beddel password-ka aad ku gasho portal-ka.</p>
                </div>
                <Link
                  href="/account"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm font-medium text-foreground-soft hover:border-accent/40 hover:text-accent"
                >
                  <KeyRound className="size-4" /> Beddel password-ka
                </Link>
              </div>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}

function Field({
  icon: Icon,
  tone,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  tone: string;
  label: string;
  value: string;
}) {
  return (
    <div className="flex min-w-0 items-center gap-3 rounded-xl border border-border p-3">
      <span className={`flex size-10 shrink-0 items-center justify-center rounded-lg ${tone}`}>
        <Icon className="size-4.5" />
      </span>
      <div className="min-w-0">
        <p className="text-xs font-medium uppercase tracking-wide text-foreground-muted">{label}</p>
        <p className="mt-0.5 truncate text-sm font-medium text-foreground">{value}</p>
      </div>
    </div>
  );
}
