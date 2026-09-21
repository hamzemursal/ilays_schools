"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { api, type School } from "@/lib/api";
import { SelectedChildProvider } from "@/features/parent-portal/SelectedChildContext";
import { ChildSwitcher } from "@/features/parent-portal/ChildSwitcher";
import { ChangePasswordForm } from "@/features/auth/ChangePasswordForm";
import { TwoFactorSection } from "@/features/account/TwoFactorSection";
import { GraduationCap, ShieldCheck } from "lucide-react";
import { Sidebar, useCurrentSchool } from "./Sidebar";
import { Topbar } from "./Topbar";
import { SuperAdminSidebar } from "./SuperAdminSidebar";
import { SuperAdminTopbar } from "./SuperAdminTopbar";
import { isSuperAdmin } from "./super-admin-nav";

export function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { user, accessToken, loading, refreshProfile } = useAuth();
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Same permission the "Schools" org nav item already gates on — an
  // org-wide account (Super Admin, Organization Admin, or a Central
  // Finance/HR viewer). Only they ever need the full authorized-schools
  // list, so nobody else pays for this fetch.
  const canSwitchSchools = !!user?.permissions.includes("schools.view");
  // The Super Admin (and only the Super Admin) gets the "Organization Control
  // Center" shell: its own navy sidebar and organization header, and the
  // scoped Indigo theme below. Every other role - School Admin, Teacher,
  // Student, Parent, Organization Admin, Central Finance/HR - renders the
  // shared Sidebar/Topbar exactly as before.
  const superAdmin = isSuperAdmin(user);
  const currentSchoolFromUrl = useCurrentSchool(user);
  const [schools, setSchools] = useState<School[] | null>(null);

  // Fetched once here, in the one common parent of Sidebar and Topbar, and
  // passed down to both — not fetched separately by each, which would just
  // be the same request twice. This is also what resolves a Super Admin's
  // real current-school name/logo: they never have a UserSchool row (that's
  // what makes them org-wide), so useCurrentSchool's own URL-only fallback
  // can't know it on its own.
  useEffect(() => {
    if (!canSwitchSchools || !accessToken) return;
    let cancelled = false;
    let retry: ReturnType<typeof setTimeout> | undefined;
    const load = (retriesLeft: number) =>
      api
        .listSchools(accessToken)
        .then((list) => {
          if (!cancelled) setSchools(list);
        })
        .catch(() => {
          if (cancelled) return;
          // One quiet retry (a cold API or a brief hiccup) before settling on
          // "none", so a transient failure never reads as "no schools".
          if (retriesLeft > 0) retry = setTimeout(() => load(retriesLeft - 1), 1500);
          else setSchools([]);
        });
    load(1);
    return () => {
      cancelled = true;
      if (retry) clearTimeout(retry);
    };
  }, [canSwitchSchools, accessToken]);

  // `schools` (from listSchools) carries the real name but no logoUrl — that
  // field only ever comes from the actor's own user.schools, which is also
  // the only case a logo is ever shown (a Super Admin's sidebar always uses
  // the organization mark, never a viewed school's logo — see Sidebar).
  const fetchedCurrentSchool = schools?.find((s) => s.id === currentSchoolFromUrl?.id);
  const resolvedCurrentSchool = currentSchoolFromUrl
    ? { id: currentSchoolFromUrl.id, name: fetchedCurrentSchool?.name ?? currentSchoolFromUrl.name, logoUrl: currentSchoolFromUrl.logoUrl }
    : null;

  useEffect(() => {
    if (!loading && !user) router.push("/portal");
  }, [loading, user, router]);

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="size-6 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      </div>
    );
  }

  // A temporary-password account (currently only Student Portal accounts,
  // see StudentsService.createPortalAccount) can't reach anything else until
  // this clears — blocks the whole shell, not just one route, since the
  // backend never assumes the frontend enforced this either.
  if (user.mustChangePassword) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface px-4">
        <div className="w-full max-w-sm rounded-xl border border-border bg-background p-6 shadow-sm">
          <div className="mb-5 flex items-center gap-2.5">
            <div className="flex size-9 items-center justify-center rounded-lg bg-accent text-white">
              <GraduationCap className="size-4.5" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">Set your password</p>
              <p className="text-xs text-foreground-muted">One-time step before you continue</p>
            </div>
          </div>
          <ChangePasswordForm forced />
        </div>
      </div>
    );
  }

  // Required for Super/Org Admins (see Part K of the blueprint) — same
  // "block the whole shell, backend enforces it too" shape as
  // mustChangePassword above. accessToken is always set once `user` is,
  // since loadProfile only ever runs right after a token is issued.
  if (user.mustSetup2FA && accessToken) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface px-4 py-8">
        <div className="w-full max-w-sm rounded-xl border border-border bg-background p-6 shadow-sm">
          <div className="mb-5 flex items-center gap-2.5">
            <div className="flex size-9 items-center justify-center rounded-lg bg-accent text-white">
              <ShieldCheck className="size-4.5" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">Set up two-factor authentication</p>
              <p className="text-xs text-foreground-muted">Required for this account before you continue</p>
            </div>
          </div>
          <TwoFactorSection accessToken={accessToken} forced onEnabled={refreshProfile} />
        </div>
      </div>
    );
  }

  return (
    <div
      data-theme={superAdmin ? "super-admin" : undefined}
      className="flex h-screen overflow-hidden bg-surface print:h-auto print:overflow-visible"
    >
      <aside className={`hidden w-64 shrink-0 border-r lg:block print:hidden ${superAdmin ? "border-sa-navy" : "border-border"}`}>
        {superAdmin ? (
          <SuperAdminSidebar user={user} resolvedCurrentSchool={resolvedCurrentSchool} />
        ) : (
          <Sidebar
            user={user}
            accessToken={accessToken}
            canSwitchSchools={canSwitchSchools}
            resolvedCurrentSchool={resolvedCurrentSchool}
            onBrandingChanged={refreshProfile}
          />
        )}
      </aside>

      {drawerOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-foreground/30" onClick={() => setDrawerOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-72 max-w-[85%] border-r border-border shadow-lg">
            <button
              onClick={() => setDrawerOpen(false)}
              className={`absolute right-3 top-3 rounded-lg p-1.5 ${
                superAdmin ? "z-10 text-slate-300 hover:bg-white/10" : "text-foreground-soft hover:bg-surface-hover"
              }`}
              aria-label="Close menu"
            >
              <X className="size-5" />
            </button>
            {superAdmin ? (
              <SuperAdminSidebar
                user={user}
                resolvedCurrentSchool={resolvedCurrentSchool}
                onNavigate={() => setDrawerOpen(false)}
              />
            ) : (
              <Sidebar
                user={user}
                accessToken={accessToken}
                canSwitchSchools={canSwitchSchools}
                resolvedCurrentSchool={resolvedCurrentSchool}
                onBrandingChanged={refreshProfile}
                onNavigate={() => setDrawerOpen(false)}
              />
            )}
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden print:overflow-visible">
        <div className="print:hidden">
          {superAdmin ? (
            <SuperAdminTopbar
              onMenuClick={() => setDrawerOpen(true)}
              resolvedCurrentSchool={resolvedCurrentSchool}
              schools={schools}
            />
          ) : (
            <Topbar
              onMenuClick={() => setDrawerOpen(true)}
              canSwitchSchools={canSwitchSchools}
              resolvedCurrentSchool={resolvedCurrentSchool}
              schools={schools}
            />
          )}
        </div>
        <SelectedChildProvider>
          <main className="flex-1 overflow-y-auto print:overflow-visible">
            <div className="print:hidden">
              <ChildSwitcher />
            </div>
            {children}
          </main>
        </SelectedChildProvider>
      </div>
    </div>
  );
}
